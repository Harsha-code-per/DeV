"""Parser for the config format described in SPEC.md."""


class ParseError(ValueError):
    def __init__(self, line, message):
        super().__init__(f"line {line}: {message}")
        self.line = line


def parse(text):
    raise NotImplementedError
