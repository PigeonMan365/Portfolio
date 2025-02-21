import deepseek

def generate_tests(summaries):
    test_cases = []
    for filename, summary in summaries:
        if filename.endswith('.py'):
            tests = deepseek.generate_tests_python(summary)
        elif filename.endswith('.js'):
            tests = deepseek.generate_tests_javascript(summary)
        elif filename.endswith('.java'):
            tests = deepseek.generate_tests_java(summary)
        test_cases.append((filename, tests))
    return test_cases
