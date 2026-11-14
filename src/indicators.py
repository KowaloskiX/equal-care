"""Registry of the public indicators the app uses.

Every number shown in the app comes from one of these indicators, so each entry carries what a judge needs to check it:
where it sits in the care pathway, which goal of the national cancer strategy 2026-2035 it serves, and the source URL.

Sources:
- Sotkanet (THL indicator bank), open REST API: https://sotkanet.fi/rest/1.1/
  Screening attendance and survival rates there are published by THL from Finnish Cancer Registry data.
- Statistics Finland (Tilastokeskus) boundaries: https://geo.stat.fi/geoserver/ (layers tilastointialueet:*)
"""
from dataclasses import dataclass

STAGES = ["context", "detection", "referral", "treatment", "outcome"]   # order of the care pathway on screen

# Goals of Kansallinen syöpästrategia 2026-2035 (p. 5, "Strategian seurantamittarit")
GOALS = {
    1: "Participation and people-centred services",
    2: "Less cancer through prevention and early detection",
    3: "Equal and effective cancer care",
    4: "A changing operating environment (research, new medicines)",
}


@dataclass(frozen=True)
class Indicator:
    key: str            # short id used in the code and the API
    sotkanet_id: int
    label: str          # short English label for the UI
    stage: str          # place in the care pathway (STAGES)
    goal: int | None    # strategy goal it measures, None for context indicators
    unit: str
    gender: str         # Sotkanet gender to prefer: "total" or "female"
    higher_is_better: bool | None = True
    target: float | None = None      # national target from the strategy, if there is one
    target_note: str | None = None

    @property
    def url(self) -> str:
        return f"https://sotkanet.fi/sotkanet/en/taulukko?indicator={self.sotkanet_id}"

    @property
    def api_url(self) -> str:
        return f"https://sotkanet.fi/rest/1.1/indicators/{self.sotkanet_id}"


INDICATORS = [
    # detection: screening programmes. Strategy goal 2: 80 % attendance in every wellbeing services county (p. 5)
    Indicator("screen_breast", 3621, "Breast cancer screening attendance", "detection", 2, "%", "female",
              target=80.0, target_note="Strategy 2026-2035, goal 2: 80 % attendance in every wellbeing services county"),
    Indicator("screen_cervix", 3620, "Cervical cancer screening attendance", "detection", 2, "%", "female",
              target=80.0, target_note="Strategy 2026-2035, goal 2: 80 % attendance in every wellbeing services county"),
    Indicator("screen_bowel", 6103, "Colorectal cancer screening attendance", "detection", 2, "%", "total",
              target=80.0, target_note="Strategy 2026-2035, goal 2: 80 % attendance in every wellbeing services county"),
    # referral: access to specialised care (all specialties; there is no cancer-only waiting indicator in Sotkanet)
    Indicator("wait_6m", 3336, "Waited over 6 months for specialised care, per 10 000", "referral", 3, "per 10 000", "total",
              higher_is_better=False),
    # treatment
    Indicator("onc_visits", 2475, "Outpatient visits, oncology and radiotherapy", "treatment", 3, "visits", "total",
              higher_is_better=None),
    Indicator("cancer_meds", 5093, "Special refund for cancer medicines, age-standardised", "treatment", 3, "%", "total",
              higher_is_better=None),
    # outcome: strategy goal 3 (equal and effective care)
    Indicator("surv_breast", 3625, "5-year relative survival, breast cancer", "outcome", 3, "%", "female"),
    Indicator("surv_cervix", 3626, "5-year relative survival, cervical cancer", "outcome", 3, "%", "female"),
    Indicator("surv_bowel", 3627, "5-year relative survival, colorectal cancer", "outcome", 3, "%", "total"),
    Indicator("cancer_index", 5643, "Cancer morbidity index, age-standardised (Finland = 100)", "outcome", 3, "index", "total",
              higher_is_better=False),
    # context: who lives there
    Indicator("population", 127, "Population at year end", "context", None, "people", "total", higher_is_better=None),
    Indicator("age65_share", 1068, "Population aged 65+, % of total", "context", None, "%", "total", higher_is_better=None),
    Indicator("foreign_lang", 187, "Native language other than Finnish, Swedish or Sami, per 1000", "context", None,
              "per 1000", "total", higher_is_better=None),
    Indicator("edu_level", 180, "Measure of educational level", "context", None, "index", "total", higher_is_better=None),
]

BY_KEY = {i.key: i for i in INDICATORS}
BY_ID = {i.sotkanet_id: i for i in INDICATORS}
