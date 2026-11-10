"""Tally: count and summarise scores."""


def parse_scores(text):
    """Parse 'name:score' pairs separated by commas into a dict."""
    scores = {}
    for item in text.split(","):
        name, score = item.split(":")
        scores[name.strip()] = int(score)
    return scores


def top(scores, n=3):
    """Return the n highest scorers as (name, score) pairs, best first."""
    return sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))[:n]
