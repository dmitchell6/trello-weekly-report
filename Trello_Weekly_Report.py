import os
import smtplib
import requests
import concurrent.futures
from datetime import datetime, timedelta
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass
from ratelimit import limits, sleep_and_retry
import sys
from dotenv import load_dotenv
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import webbrowser
import pytz  # Add this import at the top

# GUI Modules
import tkinter as tk
from tkinter import ttk, messagebox
from tkcalendar import DateEntry

# Load environment variables from the specified .env file
dotenv_path = '/Users/horus/PycharmProjects/TrelloWeeklyReport/Trello_Weekly_Report/.env'
load_dotenv(dotenv_path=dotenv_path)

# Set up logging with rotation (optional enhancement)
from logging.handlers import RotatingFileHandler

handler = RotatingFileHandler('trello_tasks.log', maxBytes=5*1024*1024, backupCount=5)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        handler
    ]
)
logger = logging.getLogger(__name__)

# Debugging: Log the loaded environment variables
logger.info(f"Trello API Key Loaded: {bool(os.getenv('TRELLO_API_KEY'))}")
logger.info(f"Trello Token Loaded: {bool(os.getenv('TRELLO_TOKEN'))}")
logger.info(f"Trello Board ID Loaded: {bool(os.getenv('TRELLO_BOARD_ID'))}")
logger.info(f"Email SMTP Server Loaded: {bool(os.getenv('EMAIL_SMTP_SERVER'))}")
logger.info(f"Email SMTP Port Loaded: {bool(os.getenv('EMAIL_SMTP_PORT'))}")
logger.info(f"Email Username Loaded: {bool(os.getenv('EMAIL_USERNAME'))}")
logger.info(f"Email Recipient Loaded: {bool(os.getenv('EMAIL_RECIPIENT'))}")

@dataclass
class TrelloConfig:
    api_key: str
    token: str
    board_id: str
    done_list_name: str = 'Done'
    date_format: str = '%Y-%m-%dT%H:%M:%S.%fZ'
    calls_per_second: int = 10  # Trello's rate limit

    # Email Configuration
    email_smtp_server: str = os.getenv('EMAIL_SMTP_SERVER')
    email_smtp_port: int = int(os.getenv('EMAIL_SMTP_PORT', 587))
    email_username: str = os.getenv('EMAIL_USERNAME')
    email_password: str = os.getenv('EMAIL_PASSWORD')
    email_recipient: str = os.getenv('EMAIL_RECIPIENT')
    email_subject: str = os.getenv('EMAIL_SUBJECT', 'Weekly Trello Report')

class TrelloAPIError(Exception):
    """Custom exception for Trello API errors"""
    pass

@sleep_and_retry
@limits(calls=10, period=1)  # Rate limit: 10 calls per second
def make_api_request(session: requests.Session, url: str, params: Dict = None) -> Dict:
    """Make a rate-limited API request to Trello"""
    try:
        response = session.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        raise TrelloAPIError(f"Failed to fetch data from Trello: {str(e)}")

def get_current_week_range(selected_start: Optional[datetime] = None, selected_end: Optional[datetime] = None):
    """
    Calculate the start and end datetime of the specified week (Sunday to Sunday) in Central Time.
    If no dates are provided, use the current week.
    """
    central = pytz.timezone('America/Chicago')
    
    if selected_start and selected_end:
        # Use user-specified dates and convert to Central time
        start_date = central.localize(selected_start.replace(hour=0, minute=0, second=0, microsecond=0))
        end_date = central.localize(selected_end.replace(hour=23, minute=59, second=59, microsecond=999999))
    else:
        # Use current week in Central time
        today = datetime.now(central)
        days_since_sunday = (today.weekday() + 1) % 7
        if days_since_sunday == 0:
            # Today is Sunday; start of the week is today
            start_date = today.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            # Most recent Sunday
            start_date = today - timedelta(days=days_since_sunday)
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        # End of the week is the end of the next Sunday
        end_date = start_date + timedelta(days=7) - timedelta(microseconds=1)
    
    return start_date, end_date

def send_email(report_content: str, config: TrelloConfig):
    """
    Send an email with the given report content.

    Args:
        report_content (str): The body of the email.
        config (TrelloConfig): Configuration object containing email settings.
    """
    # Create the email message
    message = MIMEMultipart()
    message['From'] = config.email_username
    message['To'] = config.email_recipient
    message['Subject'] = config.email_subject

    # Attach the report content as HTML
    message.attach(MIMEText(report_content, 'html'))

    try:
        # Connect to the SMTP server
        server = smtplib.SMTP(config.email_smtp_server, config.email_smtp_port)
        server.starttls()  # Secure the connection

        # Login to the SMTP server
        server.login(config.email_username, config.email_password)

        # Send the email
        server.send_message(message)
        logger.info(f"Email sent successfully to {config.email_recipient}.")
        messagebox.showinfo("Email Sent", f"Email sent successfully to {config.email_recipient}.")
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        messagebox.showerror("Email Error", f"Failed to send email: {str(e)}")
    finally:
        server.quit()

def format_report_html(start_date: datetime, end_date: datetime, tasks: List[Dict]) -> str:
    """
    Format the report content as an HTML string.

    Args:
        start_date (datetime): Start of the reporting period.
        end_date (datetime): End of the reporting period.
        tasks (List[Dict]): List of completed tasks.
    
    Returns:
        str: HTML-formatted report.
    """
    start_date_str = start_date.strftime('%Y-%m-%d')
    end_date_str = end_date.strftime('%Y-%m-%d')

    html_content = f"""
    <html>
    <head>
        <style>
            table {{
                width: 100%;
                border-collapse: collapse;
            }}
            th, td {{
                border: 1px solid #dddddd;
                text-align: left;
                padding: 8px;
            }}
            th {{
                background-color: #f2f2f2;
            }}
            tr:nth-child(even) {{
                background-color: #f9f9f9;
            }}
        </style>
    </head>
    <body>
        <h2>Weekly Trello Report</h2>
        <p><strong>Reporting Period:</strong> {start_date_str} to {end_date_str}</p>
        <p><strong>Total Tasks Completed:</strong> {len(tasks)}</p>
        <table>
            <tr>
                <th>Task Name</th>
                <th>Labels</th>
                <th>Completed By</th>
                <th>Completion Date</th>
                <th>Status</th>
                <th>URL</th>
            </tr>
    """

    for task in tasks:
        labels = ', '.join(task['labels']) if task['labels'] else 'No Labels'
        task_name = task['card_name']
        completed_by = task['moved_by']
        completion_date = task['moved_to_done_at'] if task['status'] == 'Done' else ''
        status = task.get('status', 'Unknown')
        url = f"<a href='{task['card_url']}'>Link</a>"

        html_content += f"""
            <tr>
                <td>{task_name}</td>
                <td>{labels}</td>
                <td>{completed_by}</td>
                <td>{completion_date}</td>
                <td>{status}</td>
                <td>{url}</td>
            </tr>
        """

    html_content += """
        </table>
    </body>
    </html>
    """

    return html_content

class TrelloTaskTracker:
    def __init__(self, config: TrelloConfig):
        self.config = config
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Create and configure a requests session"""
        session = requests.Session()
        session.params = {
            'key': self.config.api_key,
            'token': self.config.token
        }
        return session

    def get_list_id(self, list_name: str) -> str:
        """Get the ID of a specified list"""
        lists_url = f'https://api.trello.com/1/boards/{self.config.board_id}/lists'
        lists_data = make_api_request(self.session, lists_url)

        target_list = next(
            (l for l in lists_data if l['name'] == list_name),
            None
        )
        if not target_list:
            raise TrelloAPIError(
                f'List "{list_name}" not found on the board.'
            )
        logger.info(f"Found '{list_name}' list with ID: {target_list['id']}")
        return target_list['id']

    def get_done_list_id(self) -> str:
        """Get the ID of the 'Done' list"""
        return self.get_list_id(self.config.done_list_name)

    def fetch_card_actions(self, card: Dict) -> Optional[Dict]:
        """Fetch and process actions for a single card, including labels"""
        actions_url = f"https://api.trello.com/1/cards/{card['id']}/actions"
        try:
            actions = make_api_request(
                self.session,
                actions_url,
                params={'filter': 'updateCard'}
            )
        except TrelloAPIError as e:
            logger.error(f"Failed to fetch actions for card '{card['name']}': {str(e)}")
            return None

        # Extract labels from the card
        labels = card.get('labels', [])
        if not isinstance(labels, list):
            logger.warning(f"Unexpected labels format for card '{card['name']}': {labels}")
            labels = []

        label_names = [label.get('name', 'No Name') for label in labels]
        label_colors = [label.get('color', 'No Color') for label in labels]

        for action in actions:
            data = action.get('data', {})
            if (action['type'] == 'updateCard'
                    and 'listBefore' in data
                    and 'listAfter' in data
                    and data['listAfter'].get('name') == self.config.done_list_name):
                task_info = {
                    'card_name': card['name'],
                    'card_url': card['url'],
                    'moved_to_done_at': action['date'],
                    'moved_by': action['memberCreator']['fullName'],
                    'labels': label_names,  # Include label names
                    'label_colors': label_colors,  # Optionally include label colors
                    'status': 'Done'  # Set Status as Done
                }
                logger.info(f"Task Completed: {task_info}")
                return task_info
        return None

    def fetch_card_comments(self, card: Dict, start_date: datetime, end_date: datetime) -> Optional[Dict]:
        """Fetch and process comments for a single card"""
        actions_url = f"https://api.trello.com/1/cards/{card['id']}/actions"
        try:
            actions = make_api_request(
                self.session,
                actions_url,
                params={'filter': 'commentCard'}
            )
            
            # Check for comments within the date range
            recent_comments = []
            for action in actions:
                # Convert comment date string to timezone-aware datetime
                comment_date = datetime.strptime(action['date'], self.config.date_format)
                comment_date = pytz.UTC.localize(comment_date)
                
                # Convert start_date and end_date to UTC for comparison
                start_date_utc = start_date.astimezone(pytz.UTC)
                end_date_utc = end_date.astimezone(pytz.UTC)
                
                if start_date_utc <= comment_date <= end_date_utc:
                    recent_comments.append({
                        'text': action['data']['text'],
                        'date': action['date'],
                        'member': action['memberCreator']['fullName']
                    })
            
            if recent_comments:
                labels = card.get('labels', [])
                label_names = [label.get('name', 'No Name') for label in labels]
                return {
                    'card_name': card['name'],
                    'card_url': card['url'],
                    'labels': label_names,
                    'status': 'Doing',  # Set Status as Doing
                    'comments': recent_comments,
                    'moved_to_done_at': recent_comments[0]['date'],  # Using most recent comment date
                    'moved_by': recent_comments[0]['member']
                }
        except TrelloAPIError as e:
            logger.error(f"Failed to fetch comments for card '{card['name']}': {str(e)}")
        return None

    def get_completed_tasks_between_dates(self, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Get tasks completed or commented on between the specified start and end dates."""
        try:
            all_tasks = []
            
            # Get Done list cards
            done_list_id = self.get_done_list_id()
            done_cards_url = f'https://api.trello.com/1/lists/{done_list_id}/cards'
            done_cards = make_api_request(self.session, done_cards_url)
            
            # Get Doing list cards
            doing_list_id = self.get_list_id('Doing')
            doing_cards_url = f'https://api.trello.com/1/lists/{doing_list_id}/cards'
            doing_cards = make_api_request(self.session, doing_cards_url)

            # Process all cards concurrently
            with concurrent.futures.ThreadPoolExecutor() as executor:
                # Process Done cards
                done_futures = {
                    executor.submit(self.fetch_card_actions, card): card
                    for card in done_cards
                }
                
                # Process Doing cards
                doing_futures = {
                    executor.submit(self.fetch_card_comments, card, start_date, end_date): card
                    for card in doing_cards
                }
                
                # Combine all futures
                all_futures = {**done_futures, **doing_futures}

                for future in concurrent.futures.as_completed(all_futures):
                    try:
                        result = future.result()
                        if result:
                            # Convert the moved_to_done_at string to a timezone-aware datetime
                            moved_at = datetime.strptime(
                                result['moved_to_done_at'],
                                self.config.date_format
                            )
                            # Make it timezone-aware (UTC)
                            moved_at = pytz.UTC.localize(moved_at)
                            
                            # Convert start_date and end_date to UTC for comparison if they're not already
                            start_date_utc = start_date.astimezone(pytz.UTC)
                            end_date_utc = end_date.astimezone(pytz.UTC)
                            
                            if start_date_utc <= moved_at <= end_date_utc:
                                all_tasks.append(result)
                    except Exception as e:
                        card = all_futures[future]
                        logger.error(
                            f"Error processing card '{card['name']}': {str(e)}"
                        )

            logger.info(f"Total tasks found between {start_date} and {end_date}: {len(all_tasks)}")

            # Sort tasks by status (Done first) and then by date
            return sorted(
                all_tasks,
                key=lambda x: (x['status'] != 'Done',  # False (Done) comes before True (not Done)
                              x['moved_to_done_at']),
                reverse=True
            )

        except Exception as e:
            logger.error(f"Failed to fetch tasks: {str(e)}")
            raise

def test_env_loading():
    logger.info("Testing environment variable loading...")
    api_key = os.getenv('TRELLO_API_KEY')
    token = os.getenv('TRELLO_TOKEN')
    board_id = os.getenv('TRELLO_BOARD_ID')
    email_smtp_server = os.getenv('EMAIL_SMTP_SERVER')
    email_smtp_port = os.getenv('EMAIL_SMTP_PORT')
    email_username = os.getenv('EMAIL_USERNAME')
    email_password = os.getenv('EMAIL_PASSWORD')
    email_recipient = os.getenv('EMAIL_RECIPIENT')

    missing = []
    if not api_key:
        missing.append('TRELLO_API_KEY')
    if not token:
        missing.append('TRELLO_TOKEN')
    if not board_id:
        missing.append('TRELLO_BOARD_ID')
    if not email_smtp_server:
        missing.append('EMAIL_SMTP_SERVER')
    if not email_smtp_port:
        missing.append('EMAIL_SMTP_PORT')
    if not email_username:
        missing.append('EMAIL_USERNAME')
    if not email_password:
        missing.append('EMAIL_PASSWORD')
    if not email_recipient:
        missing.append('EMAIL_RECIPIENT')

    if missing:
        logger.error(f"Missing environment variables: {', '.join(missing)}")
    else:
        logger.info("All required environment variables are loaded successfully.")

def main():
    # Initialize the main window
    root = tk.Tk()
    root.title("Trello Weekly Report")
    root.geometry("800x600")  # Initial size; can be adjusted as needed
    root.resizable(True, True)  # Allow both horizontal and vertical resizing

    # Create a TrelloConfig instance
    config = TrelloConfig(
        api_key=os.getenv('TRELLO_API_KEY'),
        token=os.getenv('TRELLO_TOKEN'),
        board_id=os.getenv('TRELLO_BOARD_ID')
    )

    # Check for missing environment variables
    if not all([config.api_key, config.token, config.board_id,
               config.email_smtp_server, config.email_smtp_port,
               config.email_username, config.email_password,
               config.email_recipient]):
        logger.error("Missing required environment variables. Please check your .env file.")
        messagebox.showerror("Configuration Error", "Missing required environment variables. Please check your .env file.")
        sys.exit(1)

    # Instantiate TrelloTaskTracker
    tracker = TrelloTaskTracker(config)

    # Define sorting function
    def sort_column(tree, col, reverse):
        """Sort Treeview column when header is clicked."""
        data_list = [(tree.set(k, col), k) for k in tree.get_children('')]

        if col == "Completion Date":
            # Sort as dates with time
            def get_datetime(date_str):
                try:
                    return datetime.strptime(date_str, '%Y-%m-%d %I:%M %p') if date_str else datetime.min
                except ValueError:
                    return datetime.min
            
            data_list.sort(key=lambda t: get_datetime(t[0]), reverse=reverse)
        else:
            # Sort as strings
            data_list.sort(reverse=reverse)

        for index, (val, k) in enumerate(data_list):
            tree.move(k, '', index)

        tree.heading(col, command=lambda: sort_column(tree, col, not reverse))

    # Define functions for the GUI
    def generate_report():
        try:
            # Get selected dates
            start_date = start_cal.get_date()
            end_date = end_cal.get_date()

            # Convert to datetime objects in Central time
            central = pytz.timezone('America/Chicago')
            start_datetime = central.localize(datetime.combine(start_date, datetime.min.time()))
            end_datetime = central.localize(datetime.combine(end_date, datetime.max.time()))

            if start_datetime > end_datetime:
                messagebox.showerror("Date Selection Error", "Start date must be before or equal to end date.")
                return

            # Optional: Ensure both dates are Sundays
            if start_datetime.weekday() != 6 or end_datetime.weekday() != 6:
                messagebox.showwarning("Date Selection Warning", "It's recommended to select Sundays for both start and end dates.")

            # Fetch completed tasks between the selected dates
            tasks = tracker.get_completed_tasks_between_dates(start_datetime, end_datetime)

            # Clear the Treeview
            for item in tree.get_children():
                tree.delete(item)

            # Insert new data into the Treeview
            for task in tasks:
                # Convert UTC timestamp to Central time
                completion_date = ''
                if task['status'] == 'Done':
                    utc_date = datetime.strptime(task['moved_to_done_at'], config.date_format)
                    utc_date = utc_date.replace(tzinfo=pytz.UTC)
                    central_date = utc_date.astimezone(central)
                    completion_date = central_date.strftime('%Y-%m-%d %I:%M %p')
                
                tree.insert("", "end", values=(
                    task['card_name'],
                    ', '.join(task['labels']) if task['labels'] else 'No Labels',
                    task['moved_by'],
                    completion_date,  # Now includes time in Central timezone
                    task['status'],
                    task['card_url']
                ))

            # Prepare the report for email
            report_html = format_report_html(start_datetime, end_datetime, tasks)

            # Enable the Send Email button if there are tasks
            if tasks:
                send_email_button.config(state=tk.NORMAL)
                # Store the report content for emailing
                send_email_button.report_content = report_html
            else:
                send_email_button.config(state=tk.DISABLED)

            # Inform the user
            messagebox.showinfo("Report Generated", f"Report generated successfully with {len(tasks)} tasks.")

        except TrelloAPIError as e:
            logger.error(f"Trello API Error: {str(e)}")
            messagebox.showerror("Trello API Error", f"Failed to fetch data from Trello: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected Error: {str(e)}")
            messagebox.showerror("Error", f"An unexpected error occurred: {str(e)}")

    def send_report_via_email():
        try:
            report_content = send_email_button.report_content
            send_email(report_content, config)
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            messagebox.showerror("Email Error", f"Failed to send email: {str(e)}")

    # Create GUI Components
    # Date Selection Frame
    date_frame = ttk.LabelFrame(root, text="Select Date Range")
    date_frame.pack(padx=10, pady=10, fill="x")  # Fill horizontally

    # Start Date
    ttk.Label(date_frame, text="Start Date (Sunday):").grid(row=0, column=0, padx=10, pady=10, sticky="w")
    start_cal = DateEntry(date_frame, width=12, background='darkblue',
                          foreground='white', borderwidth=2, date_pattern='y-mm-dd',
                          firstweekday='sunday')
    start_cal.grid(row=0, column=1, padx=10, pady=10, sticky="w")

    # End Date
    ttk.Label(date_frame, text="End Date (Sunday):").grid(row=0, column=2, padx=10, pady=10, sticky="w")
    end_cal = DateEntry(date_frame, width=12, background='darkblue',
                        foreground='white', borderwidth=2, date_pattern='y-mm-dd',
                        firstweekday='sunday')
    end_cal.grid(row=0, column=3, padx=10, pady=10, sticky="w")

    # Generate Report Button
    generate_button = ttk.Button(root, text="Generate Report", command=generate_report)
    generate_button.pack(pady=10)

    # Treeview Frame
    tree_frame = ttk.Frame(root)
    tree_frame.pack(padx=10, pady=10, fill="both", expand=True)  # Fill both directions

    # Scrollbars
    tree_scroll_y = ttk.Scrollbar(tree_frame, orient="vertical")
    tree_scroll_y.pack(side="right", fill="y")

    tree_scroll_x = ttk.Scrollbar(tree_frame, orient="horizontal")
    tree_scroll_x.pack(side="bottom", fill="x")

    # Define Columns
    columns = ("Task Name", "Labels", "Completed By", "Completion Date", "Status", "URL")

    tree = ttk.Treeview(tree_frame, columns=columns, show="headings",
                        yscrollcommand=tree_scroll_y.set,
                        xscrollcommand=tree_scroll_x.set)

    # Configure Scrollbars
    tree_scroll_y.config(command=tree.yview)
    tree_scroll_x.config(command=tree.xview)

    # Define Headings and Configure Column Stretching
    for col in columns:
        if col in ["Status", "Completion Date"]:
            # Bind the sort_column function to these column headers
            tree.heading(col, text=col, command=lambda _col=col: sort_column(tree, _col, False))
        else:
            # No sorting for other columns
            tree.heading(col, text=col)
        tree.column(col, anchor="w", width=150, minwidth=100, stretch=True)

    tree.pack(fill="both", expand=True)

    # Send Email Button
    send_email_button = ttk.Button(root, text="Send Report via Email", command=send_report_via_email, state=tk.DISABLED)
    send_email_button.pack(pady=10)

    # Add this function inside main()
    def on_tree_click(event):
        item = tree.identify('item', event.x, event.y)
        if item:
            column = tree.identify_column(event.x)
            if column == '#6':  # URL column
                values = tree.item(item)['values']
                if values and len(values) >= 6:
                    url = values[5]  # Get the URL from the values
                    if url and isinstance(url, str):  # Verify we have a valid string
                        webbrowser.open(url)

    # Add this line after tree.pack()
    tree.bind('<Button-1>', on_tree_click)

    # Run the GUI loop
    root.mainloop()

if __name__ == '__main__':
    main()
