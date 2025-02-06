# Device Scan Report

This project is a comprehensive device scanning tool that gathers various system and network information, checks for vulnerabilities, and compiles a detailed report. It is designed to work on both Windows and Linux systems.

## Features

- **System Information**: Collects basic system information such as OS, OS version, hostname, and IP address.
- **Network Configuration**: Gathers network configuration details including interface, IP address, and MAC address.
- **Open Ports Scan**: Scans for open ports on a specified IP address.
- **Installed Software**: Lists installed software and their versions.
- **Running Processes**: Lists running processes and their details.
- **Security Settings**: Checks common security settings such as firewall and antivirus status.
- **User Accounts**: Lists user accounts and their privileges.
- **File System Information**: Gathers information about the file system.
- **Vulnerability Check**: Checks installed software against known vulnerabilities from CISA, NVD, and CVE Details.
- **Report Compilation**: Compiles the gathered data into a user-friendly report.

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/yourusername/device-scan-report.git
    cd device-scan-report
    ```

2. Install the required dependencies:
    ```sh
    pip install -r requirements.txt
    ```

## Usage

Run the script to generate the device scan report:
```sh
python device_scan_report.py