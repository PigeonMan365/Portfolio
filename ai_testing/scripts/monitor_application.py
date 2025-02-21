import logging
import psutil
import requests
import time

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def check_service_status(url):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            logging.info(f"Service at {url} is up and running.")
        else:
            logging.warning(f"Service at {url} returned status code {response.status_code}.")
    except requests.exceptions.RequestException as e:
        logging.error(f"Service at {url} is down. Error: {e}")

def monitor_system_resources():
    cpu_usage = psutil.cpu_percent(interval=1)
    memory_info = psutil.virtual_memory()
    logging.info(f"CPU Usage: {cpu_usage}%")
    logging.info(f"Memory Usage: {memory_info.percent}%")

def monitor_application():
    service_urls = [
        'http://localhost:5000',
        'http://localhost:5001',
        'http://localhost:5002',
        'http://localhost:5003'
    ]

    while True:
        logging.info("Starting monitoring cycle...")

        # Check the status of each service
        for url in service_urls:
            check_service_status(url)

        # Monitor system resources
        monitor_system_resources()

        logging.info("Monitoring cycle complete. Sleeping for 60 seconds...")
        time.sleep(60)

if __name__ == "__main__":
    monitor_application()
