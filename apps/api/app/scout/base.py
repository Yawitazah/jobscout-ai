from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class NormalizedJob:
    source_platform: str
    source_id: str
    source_url: str
    title: str
    company_name: str
    company_website: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[str] = None
    remote_eligibility: Optional[str] = None
    employment_type: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    description: str = ""
    posted_at: Optional[str] = None
    raw_data: dict = field(default_factory=dict)


class SourceAdapter(ABC):
    name: str

    @abstractmethod
    async def fetch_company_jobs(self, company_id: str) -> list[NormalizedJob]:
        pass

    @abstractmethod
    def list_known_companies(self) -> list[str]:
        pass
