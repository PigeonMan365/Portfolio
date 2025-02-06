import platform
import socket
import psutil
from scapy.all import sr1, IP, TCP
import subprocess
import requests

def get_system_info():
    """Gathers basic system information.

    Returns:
        dict: A dictionary containing OS, OS version, hostname, and IP address.
    """
    system_info = {
        "OS": platform.system(),
        "OS Version": platform.version(),
        "Hostname": socket.gethostname(),
        "IP Address": socket.gethostbyname(socket.gethostname())
    }
    return system_info

def get_network_info():
    """Collects network configuration details.

    Returns:
        list: A list of dictionaries containing interface, IP address, and MAC address.
    """
    network_info = []
    for interface, addrs in psutil.net_if_addrs().items():
        mac_address = None
        for addr in addrs:
            if addr.family == psutil.AF_LINK:
                mac_address = addr.address
            elif addr.family == socket.AF_INET:
                network_info.append({
                    "Interface": interface,
                    "IP Address": addr.address,
                    "MAC Address": mac_address
                })
    return network_info

def scan_open_ports(ip, ports):
    """Scans for open ports on the specified IP address.

    Args:
        ip (str): The IP address to scan.
        ports (list): A list of ports to scan.

    Returns:
        list: A list of open ports.
    """
    open_ports = []
    for port in ports:
        pkt = IP(dst=ip)/TCP(dport=port, flags="S")
        resp = sr1(pkt, timeout=1, verbose=0)
        if resp and resp.haslayer(TCP) and resp[TCP].flags == 0x12:
            open_ports.append(port)
    return open_ports

def get_installed_software():
    """Lists installed software and their versions.

    Returns:
        list: A list of dictionaries containing software names and versions.
    """
    installed_software = []
    if platform.system() == "Windows":
        result = subprocess.run(["wmic", "product", "get", "name,version"], capture_output=True, text=True)
        lines = result.stdout.split("\n")[1:]
        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                name = " ".join(parts[:-1])
                version = parts[-1]
                installed_software.append({"Name": name.strip(), "Version": version.strip()})
    elif platform.system() == "Linux":
        result = subprocess.run(["dpkg-query", "-W", "-f=${binary:Package} ${Version}\n"], capture_output=True, text=True)
        for line in result.stdout.split("\n"):
            if line.strip():
                name, version = line.split()
                installed_software.append({"Name": name.strip(), "Version": version.strip()})
    return installed_software

def get_running_processes():
    """Lists running processes and their details.

    Returns:
        list: A list of dictionaries containing process IDs, names, and usernames.
    """
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'username']):
        processes.append(proc.info)
    return processes

def get_security_settings():
    """Checks common security settings such as firewall and antivirus status.

    Returns:
        dict: A dictionary containing firewall and antivirus status.
    """
    security_settings = {
        "Firewall": "Unknown",
        "Antivirus": "Unknown"
    }
    if platform.system() == "Windows":
        firewall_status = subprocess.run(["netsh", "advfirewall", "show", "allprofiles"], capture_output=True, text=True)
        security_settings["Firewall"] = "Enabled" if "ON" in firewall_status.stdout else "Disabled"
        antivirus_status = subprocess.run(["powershell", "Get-MpComputerStatus"], capture_output=True, text=True)
        security_settings["Antivirus"] = "Enabled" if "RealTimeProtectionEnabled" in antivirus_status.stdout else "Disabled"
    elif platform.system() == "Linux":
        firewall_status = subprocess.run(["ufw", "status"], capture_output=True, text=True)
        security_settings["Firewall"] = "Enabled" if "active" in firewall_status.stdout else "Disabled"
        # Antivirus check can be added based on the specific antivirus software used
    return security_settings

def get_user_accounts():
    """Lists user accounts and their privileges.

    Returns:
        list: A list of user accounts.
    """
    user_accounts = []
    if platform.system() == "Windows":
        result = subprocess.run(["net", "user"], capture_output=True, text=True)
        for line in result.stdout.split("\n")[4:]:
            if line.strip():
                user_accounts.append(line.strip())
    elif platform.system() == "Linux":
        with open("/etc/passwd") as f:
            for line in f:
                user_accounts.append(line.split(":")[0])
    return user_accounts

def get_file_system_info():
    """Gathers information about the file system.

    Returns:
        list: A list of dictionaries containing device, mountpoint, file system type, total size, used space, free space, and percentage used.
    """
    file_system_info = []
    for part in psutil.disk_partitions():
        usage = psutil.disk_usage(part.mountpoint)
        file_system_info.append({
            "Device": part.device,
            "Mountpoint": part.mountpoint,
            "File System Type": part.fstype,
            "Total Size": usage.total,
            "Used": usage.used,
            "Free": usage.free,
            "Percentage Used": usage.percent
        })
    return file_system_info

def check_vulnerabilities(installed_software):
    """Checks installed software against known vulnerabilities.

    Args:
        installed_software (list): A list of dictionaries containing software names and versions.

    Returns:
        list: A list of vulnerable software.
    """
    vulnerable_software = []

    # Fetch the known vulnerabilities from CISA
    try:
        cisa_response = requests.get("https://www.cisa.gov/known-exploited-vulnerabilities-catalog.json")
        if cisa_response.status_code == 200:
            cisa_vulnerabilities = cisa_response.json()
            for software in installed_software:
                for vulnerability in cisa_vulnerabilities:
                    if software["Name"].lower() in vulnerability["Vendor/Project"].lower():
                        vulnerable_software.append({
                            "Name": software["Name"],
                            "Version": software["Version"],
                            "Vulnerability": vulnerability["CVE"]
                        })
    except Exception as e:
        print(f"Error fetching CISA vulnerabilities: {e}")

    # Fetch the known vulnerabilities from NVD
    try:
        nvd_response = requests.get("https://services.nvd.nist.gov/rest/json/cves/1.0")
        if nvd_response.status_code == 200:
            nvd_vulnerabilities = nvd_response.json()["result"]["CVE_Items"]
            for software in installed_software:
                for vulnerability in nvd_vulnerabilities:
                    if software["Name"].lower() in vulnerability["cve"]["CVE_data_meta"]["ID"].lower():
                        vulnerable_software.append({
                            "Name": software["Name"],
                            "Version": software["Version"],
                            "Vulnerability": vulnerability["cve"]["CVE_data_meta"]["ID"]
                        })
    except Exception as e:
        print(f"Error fetching NVD vulnerabilities: {e}")

    # Fetch the known vulnerabilities from CVE Details
    try:
        cve_details_response = requests.get("https://www.cvedetails.com/json-feed.php")
        if cve_details_response.status_code == 200:
            cve_details_vulnerabilities = cve_details_response.json()
            for software in installed_software:
                for vulnerability in cve_details_vulnerabilities:
                    if software["Name"].lower() in vulnerability["product"].lower():
                        vulnerable_software.append({
                            "Name": software["Name"],
                            "Version": software["Version"],
                            "Vulnerability": vulnerability["cve_id"]
                        })
    except Exception as e:
        print(f"Error fetching CVE Details vulnerabilities: {e}")

    return vulnerable_software

def compile_report(report, vulnerable_software):
    """Compiles the gathered data into a user-friendly report.

    Args:
        report (dict): The collected data.
        vulnerable_software (list): A list of vulnerable software.

    Returns:
        str: A formatted report as a string.
    """
    compiled_report = "Device Scan Report\n"
    compiled_report += "="*20 + "\n\n"

    # Adding summary at the top
    summary = "Summary:\n"
    summary += "This report provides a comprehensive overview of the device's security and overall configuration. "
    summary += "It includes details about the operating system, network configuration, open ports, installed software, running processes, security settings, user accounts, and file system information.\n\n"
    summary += "Security Overview:\n"
    summary += f"Firewall: {report['Security Settings']['Firewall']}\n"
    summary += f"Antivirus: {report['Security Settings']['Antivirus']}\n"
    summary += f"Vulnerable Software: {len(vulnerable_software)} items found\n\n"
    summary += "Recommendations:\n"
    summary += "1. Ensure your firewall is enabled and properly configured to block unauthorized access.\n"
    summary += "2. Keep your antivirus software up to date and perform regular scans to detect and remove malware.\n"
    summary += "3. Review the list of vulnerable software and update or replace any software with known vulnerabilities.\n"
    summary += "4. Regularly update your operating system and installed software to the latest versions to mitigate security risks.\n"
    summary += "5. Limit the number of open ports to only those necessary for your applications and services.\n"
    summary += "6. Monitor running processes and terminate any suspicious or unauthorized processes.\n"
    summary += "7. Review user accounts and remove any unnecessary or inactive accounts to reduce potential attack vectors.\n\n"
    compiled_report += summary

    for section, data in report.items():
        compiled_report += f"{section}:\n{'-'*20}\n"
        if isinstance(data, list):
            for item in data:
                compiled_report += f"{item}\n"
        else:
            compiled_report += f"{data}\n"
        compiled_report += "\n"

    if vulnerable_software:
        compiled_report += "Vulnerable Software:\n"
        compiled_report += "-"*20 + "\n"
        for software in vulnerable_software:
            compiled_report += f"Name: {software['Name']}, Version: {software['Version']}, Vulnerability: {software['Vulnerability']}\n"
        compiled_report += "\n"

    return compiled_report

if __name__ == "__main__":
    # Collecting all the relevant data
    report = {
        "System Information": get_system_info(),
        "Network Configuration": get_network_info(),
        "Open Ports": scan_open_ports("127.0.0.1", [22, 80, 443]),
        "Installed Software": get_installed_software(),
        "Running Processes": get_running_processes(),
        "Security Settings": get_security_settings(),
        "User Accounts": get_user_accounts(),
        "File System Information": get_file_system_info()
    }

    # Checking for vulnerabilities
    vulnerable_software = check_vulnerabilities(report["Installed Software"])

    # Compiling the report
    compiled_report = compile_report(report, vulnerable_software)

    # Saving the compiled report to a file
    with open("device_scan_report.txt", 'w') as f:
        f.write(compiled_report)

    # Printing the compiled report to the screen
    print(compiled_report)

    print("Device scan report saved to device_scan_report.txt")
