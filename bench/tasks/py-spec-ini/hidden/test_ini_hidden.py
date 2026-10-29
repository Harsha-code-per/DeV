import unittest

import ini
from ini import ParseError, parse


class ParseTest(unittest.TestCase):
    def assertErrorLine(self, text, line):
        with self.assertRaises(ParseError) as caught:
            parse(text)
        self.assertEqual(caught.exception.line, line)
        self.assertIsInstance(caught.exception, ValueError)

    def test_example_file(self):
        with open("example.ini") as handle:
            result = parse(handle.read())
        self.assertEqual(
            result,
            {
                "": {"name": "billing"},
                "server": {"host": "0.0.0.0", "port": 8080, "debug": False},
                "paths": {"log": "/var/log/billing app.log", "motd": 'Welcome!\nRead the "docs".'},
            },
        )
        self.assertEqual(list(result), ["", "server", "paths"])

    def test_comments_blank_lines_and_crlf(self):
        text = "  # comment\r\n\r\n   ; another\r\n[a]\r\n  key=value  \r\n\t\r\n"
        self.assertEqual(parse(text), {"a": {"key": "value"}})

    def test_no_default_section_without_keys(self):
        self.assertEqual(parse("[only]\n"), {"only": {}})
        self.assertEqual(parse(""), {})

    def test_sections_order_and_reopening(self):
        text = "[b]\nx=1\n[ a ]\ny=2\n[b]\nz=3\n[B]\n"
        result = parse(text)
        self.assertEqual(result, {"b": {"x": 1, "z": 3}, "a": {"y": 2}, "B": {}})
        self.assertEqual(list(result), ["b", "a", "B"])

    def test_keys_lowercased_and_split_at_first_equals(self):
        self.assertEqual(parse("[s]\nMixed Case = a=b=c\n"), {"s": {"mixed case": "a=b=c"}})

    def test_duplicate_keys(self):
        self.assertErrorLine("[s]\na=1\nA=2\n", 3)
        self.assertErrorLine("[s]\na=1\n[t]\na=1\n[s]\n\na=3\n", 7)
        self.assertEqual(parse("[s]\na=1\n[t]\na=2\n"), {"s": {"a": 1}, "t": {"a": 2}})

    def test_inline_comments(self):
        result = parse("[s]\na = one ; c\nb = two # c\nurl = a#b;c\nc = x\t;tab comment\nd = ;only comment\n")
        self.assertEqual(result["s"], {"a": "one", "b": "two", "url": "a#b;c", "c": "x", "d": ""})

    def test_conversions(self):
        result = parse("[s]\na = TRUE\nb = false\nc = -17\nd = 007\ne = 1.5\nf = yes\ng =\nh = - 3\ni = 12abc\n")
        self.assertEqual(result["s"], {"a": True, "b": False, "c": -17, "d": 7, "e": "1.5", "f": "yes", "g": "", "h": "- 3", "i": "12abc"})
        self.assertIs(result["s"]["a"], True)
        self.assertIs(type(result["s"]["c"]), int)

    def test_quoted_values(self):
        text = '[s]\na = "  padded  "\nb = "42"\nc = "true"\nd = "semi ; colon # hash"\ne = "tab\\there"\nf = "back\\\\slash"\ng = ""\nh = "x";comment\ni = "y"   # comment\n'
        self.assertEqual(
            parse(text)["s"],
            {"a": "  padded  ", "b": "42", "c": "true", "d": "semi ; colon # hash", "e": "tab\there", "f": "back\\slash", "g": "", "h": "x", "i": "y"},
        )

    def test_quoted_errors(self):
        self.assertErrorLine('[s]\na = "never closed\n', 2)
        self.assertErrorLine('[s]\n\na = "bad \\q escape"\n', 3)
        self.assertErrorLine('a = "x" trailing\n', 1)
        self.assertErrorLine('a = "ends with backslash\\"\n', 1)

    def test_structural_errors(self):
        self.assertErrorLine("[s]\njust some words\n", 2)
        self.assertErrorLine("[s]\n= value\n", 2)
        self.assertErrorLine("ok = 1\n[   ]\n", 2)
        self.assertErrorLine("[unclosed\n", 1)
        self.assertErrorLine("# fine\r\n[s]\r\n  =x\r\n", 3)

    def test_parse_error_class(self):
        self.assertTrue(issubclass(ini.ParseError, ValueError))


if __name__ == "__main__":
    unittest.main()
