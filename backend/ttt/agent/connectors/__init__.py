"""Agent-side connector registry.

Connectors are snapshot-driven: sources arrive from the backend's
`ProjectSnapshot` and tokens come from env vars injected at container
start.

Order matters: the registry's iteration order determines section order
in the agent's system prompt and the order of connector-data validation.
"""

from __future__ import annotations

from ttt.agent.connectors.base import Connector, SourceItem, format_pages
from ttt.agent.connectors.confluence import ConfluenceConnector, ConfluenceExtra
from ttt.agent.connectors.github import GitHubConnector, GitHubExtra
from ttt.agent.connectors.webex import WebexConnector, WebexExtra

REGISTRY: list[Connector] = [
    GitHubConnector(),
    WebexConnector(),
    ConfluenceConnector(),
]

__all__ = [
    "REGISTRY",
    "Connector",
    "ConfluenceConnector",
    "ConfluenceExtra",
    "GitHubConnector",
    "GitHubExtra",
    "SourceItem",
    "WebexConnector",
    "WebexExtra",
    "format_pages",
]
