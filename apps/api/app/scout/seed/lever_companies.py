KNOWN_LEVER_SLUGS = [
    # AI / ML
    "openai", "anthropic", "scaleai", "cohere", "hugging-face",
    "together-ai", "perplexity", "inflection-ai", "adept", "imbue",
    "weights-biases", "lightmatter", "d-matrix", "groq",
    # Fintech
    "ramp", "brex", "mercury", "plaid", "stripe", "chime",
    "marqeta", "unit", "column", "modern-treasury", "lithic",
    "synapse", "treasury-prime", "increase",
    # Developer tools / infra
    "linear", "vercel", "render", "fly", "railway", "supabase",
    "planetscale", "neon", "turso", "convex", "liveblocks",
    "inngest", "trigger", "quirrel", "upstash",
    # Enterprise SaaS
    "hubspot", "figma", "notion", "airtable", "clickup",
    "monday", "asana", "coda", "miro", "loom",
    # Cloud / security
    "snyk", "wiz", "orca-security", "lacework", "drata",
    "vanta", "secureframe", "thoropass", "tugboat-logic",
    # Consumer / marketplace
    "netflix", "shopify", "spotify", "discord", "reddit",
    "pinterest", "tumblr", "quora", "medium", "substack",
    # Healthcare tech
    "ro", "hims", "hers", "nomi", "eden-health", "spring-health",
    "brightside", "cerebral", "headway", "grow-therapy",
    # HR tech
    "lattice", "rippling", "deel", "remote", "oyster",
    "leapsome", "culture-amp", "15five", "betterworks",
    # Data / analytics
    "dbt-labs", "airbyte", "fivetran", "stitch", "meltano",
    "metabase", "lightdash", "hex", "observable",
    # Marketing tech
    "attentive", "klaviyo", "postscript", "sendlane", "omnisend",
    "yotpo", "gorgias", "okendo", "stamped",
    # Real estate
    "opendoor", "flyhomes", "divvy", "landis", "homeward",
    # Logistics
    "flexport", "stord", "shipbob", "shippo", "easypost",
    # Climate / energy
    "watershed", "patch", "pachama", "terraformation",
    "arcadia", "octopus-energy", "ovo-energy",
    # Legal tech
    "ironclad", "spellbook", "harvey", "lexion", "evisort",
    # Education
    "duolingo", "coursera", "synthesis", "primer", "outschool",
    # Crypto / Web3
    "coinbase", "kraken", "gemini", "alchemy", "infura",
    "opensea", "magic-eden", "blur",
    # Gaming
    "roblox", "unity", "epic-games", "riot-games",
    # B2B misc
    "retool", "airplane", "appsmith", "budibase", "tooljet",
    "n8n", "zapier", "make", "activepieces",
]

_seen: set[str] = set()
_deduped: list[str] = []
for _slug in KNOWN_LEVER_SLUGS:
    if _slug not in _seen:
        _seen.add(_slug)
        _deduped.append(_slug)
KNOWN_LEVER_SLUGS = _deduped
