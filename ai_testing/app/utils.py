import os

def read_project(folder_path):
    # Read all files in the project folder
    files = []
    for root, _, filenames in os.walk(folder_path):
        for filename in filenames:
            with open(os.path.join(root, filename), 'r') as file:
                files.append((filename, file.read()))
    return files
