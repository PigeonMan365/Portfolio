import deepseek

def analyze_code(files):
    analysis_results = []
    for filename, file_content in files:
        if filename.endswith('.py'):
            analysis = deepseek.analyze_python(file_content)
        elif filename.endswith('.js'):
            analysis = deepseek.analyze_javascript(file_content)
        elif filename.endswith('.java'):
            analysis = deepseek.analyze_java(file_content)
        analysis_results.append((filename, analysis))
    return analysis_results
