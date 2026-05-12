KNOWN_GREENHOUSE_SLUGS = [
    # Tier 1 tech
    "stripe", "airbnb", "doordash", "figma", "notionhq", "pinterest",
    "robinhood", "instacart", "asana", "dropbox", "gusto", "lyft",
    "cloudflare", "twilio", "github", "datadog", "mongodb", "snowflake",
    "segment", "ramp", "brex", "plaid", "vercel", "mercury", "retool",
    "scaleai", "hashicorp",
    # Enterprise / big tech
    "apple", "microsoft", "meta", "amazon", "netflix", "uber", "airbnb",
    "salesforce", "oracle", "ibm", "intel", "amd", "nvidia",
    "palantir", "zendesk", "hubspot", "atlassian", "okta", "pagerduty",
    "twistbioscience", "workday", "servicenow", "veeva", "splunk",
    # Fintech
    "square", "chime", "coinbase", "gemini", "ripple", "kraken",
    "marqeta", "adyen", "affirm", "klarna", "payoneer", "braintree",
    # Cloud / infra
    "hashicorp", "confluent", "databricks", "dbt-labs", "fivetran",
    "airbyte", "temporal", "grafana", "sentry", "launchdarkly",
    "circleci", "fastly", "cloudsmith", "pulumi", "teleport",
    # AI / ML
    "huggingface", "cohere", "weights-biases", "together-ai", "mistral",
    "perplexity", "character-ai", "inflection", "stability", "runway",
    # Consumer / marketplace
    "etsy", "wayfair", "rover", "taskus", "thumbtack", "hippo",
    "eventbrite", "meetup", "houzz", "angi", "poshmark", "depop",
    # Healthcare tech
    "oscar", "devoted", "cityblock", "nomi-health", "cohere-health",
    "collectivehealth", "accolade", "hims", "hers", "ro",
    # Media / content
    "buzzfeed", "vox", "substack", "beehiiv", "ghost", "medium",
    "spotify", "soundcloud", "bandcamp",
    # Dev tools
    "jetbrains", "postman", "readme", "stoplight", "apiary",
    "swaggerhub", "spectral", "insomnia",
    # E-commerce / retail
    "shopify", "bigcommerce", "woocommerce", "magento",
    "klaviyo", "yotpo", "recharge", "gorgias",
    # Security
    "crowdstrike", "sentinelone", "lacework", "orca-security",
    "snyk", "veracode", "checkmarx", "wiz-io",
    # HR tech
    "lattice", "rippling", "deel", "remote", "oyster", "papaya",
    "workramp", "leapsome", "culture-amp",
    # Legal / compliance
    "ironclad", "contractpodaim", "evisort", "summize",
    # Data / analytics
    "looker", "mode", "hex", "observable", "preset", "cube",
    "lightdash", "metabase", "redash",
    # Marketing tech
    "braze", "amplitude", "mixpanel", "heap", "fullstory",
    "hotjar", "contentsquare", "mouseflow",
    # Real estate tech
    "opendoor", "offerpad", "compass", "blend", "better",
    "homeward", "ribbon", "orchard",
    # Education tech
    "duolingo", "coursera", "udemy", "chegg", "kahoot",
    "instructure", "renaissance", "powerschool",
    # Travel tech
    "airbnb", "vrbo", "tripadvisor", "hopper", "kiwi",
    "skyscanner", "momondo",
    # Logistics / supply chain
    "flexport", "shipbob", "shippo", "easypost", "stord",
    "project44", "fourkites", "descartes",
    # Gaming
    "roblox", "unity", "epic", "activision", "ea", "zynga",
    "riot", "discord", "twitch",
    # B2B SaaS
    "notion", "airtable", "coda", "clickup", "monday",
    "linear", "height", "shortcut", "basecamp",
]

# Deduplicate while preserving order
_seen = set()
_deduped = []
for slug in KNOWN_GREENHOUSE_SLUGS:
    if slug not in _seen:
        _seen.add(slug)
        _deduped.append(slug)
KNOWN_GREENHOUSE_SLUGS = _deduped
