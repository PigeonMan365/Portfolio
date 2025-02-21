import unittest
from app.test_generation import generate_tests

class TestTestGeneration(unittest.TestCase):
    def test_generate_tests(self):
        summaries = [("test.py", {"functions": ["foo"]})]
        tests = generate_tests(summaries)
        self.assertIsNotNone(tests)

if __name__ == '__main__':
    unittest.main()
