import llama

def summarize_code(analysis_results):
    summaries = []
    for filename, analysis in analysis_results:
        if filename.endswith('.py'):
            summary = llama.summarize_python(analysis)
        elif filename.endswith('.js'):
            summary = llama.summarize_javascript(analysis)
        elif filename.endswith('.java'):
            summary = llama.summarize_java(analysis)
        summaries.append((filename, summary))
    return summaries
