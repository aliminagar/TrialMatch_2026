"""Unit tests for Pydantic data contracts.

Covers boundary validation, required/optional fields, and extra="forbid"
rejection per PROJECT_PLAN.docx Section 8.2 + Section 15.1.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from trialmatch.models import (
    DEFAULT_DISCLAIMER,
    ClinicalNote,
    Criterion,
    CriterionVerdict,
    Diagnosis,
    GeoConstraint,
    LabValue,
    MatchOptions,
    MatchReport,
    MatchRequest,
    PatientProfile,
    Trial,
    TrialVerdict,
)


# ---- Diagnosis / ICD-10 -----------------------------------------------------

class TestDiagnosis:
    @pytest.mark.parametrize("code", ["I10", "E11.9", "C50.911", "S72.001A", "c50.911"])
    def test_valid_icd10_codes_normalize_to_upper(self, code: str) -> None:
        d = Diagnosis(icd10=code)
        assert d.icd10 == code.upper()

    @pytest.mark.parametrize(
        "code",
        ["", "1A0", "II10", "I", "I1", "I10.", "I10.TOOLONG", "10.5"],
    )
    def test_invalid_icd10_codes_rejected(self, code: str) -> None:
        with pytest.raises(ValidationError):
            Diagnosis(icd10=code)

    def test_description_optional(self) -> None:
        d = Diagnosis(icd10="I10")
        assert d.description is None

    def test_extra_forbid(self) -> None:
        with pytest.raises(ValidationError):
            Diagnosis(icd10="I10", unknown_field="x")  # type: ignore[call-arg]


# ---- LabValue ---------------------------------------------------------------

class TestLabValue:
    def test_required_fields(self) -> None:
        lv = LabValue(value=12.5, unit="mg/dL")
        assert lv.value == 12.5
        assert lv.reference_range is None

    def test_missing_required_field(self) -> None:
        with pytest.raises(ValidationError):
            LabValue(value=12.5)  # type: ignore[call-arg]


# ---- GeoConstraint ----------------------------------------------------------

class TestGeoConstraint:
    def test_country_uppercased(self) -> None:
        g = GeoConstraint(country="us")
        assert g.country == "US"

    @pytest.mark.parametrize("country", ["U", "USA", "U S", ""])
    def test_invalid_country_length(self, country: str) -> None:
        with pytest.raises(ValidationError):
            GeoConstraint(country=country)

    def test_state_uppercased(self) -> None:
        g = GeoConstraint(country="US", state="la")
        assert g.state == "LA"

    def test_max_distance_must_be_non_negative(self) -> None:
        with pytest.raises(ValidationError):
            GeoConstraint(country="US", max_distance_km=-1)


# ---- PatientProfile ---------------------------------------------------------

class _PrimaryDiag:
    """Convenience for building a valid primary_diagnosis quickly."""

    @staticmethod
    def make() -> Diagnosis:
        return Diagnosis(icd10="C50.911", description="Breast neoplasm")


class TestPatientProfile:
    @pytest.mark.parametrize("age", [0, 1, 60, 120])
    def test_valid_age_boundaries(self, age: int) -> None:
        p = PatientProfile(age=age, sex="female", primary_diagnosis=_PrimaryDiag.make())
        assert p.age == age

    @pytest.mark.parametrize("age", [-1, 121, 1000])
    def test_invalid_age_boundaries(self, age: int) -> None:
        with pytest.raises(ValidationError):
            PatientProfile(age=age, sex="female", primary_diagnosis=_PrimaryDiag.make())

    @pytest.mark.parametrize("ecog", [0, 1, 2, 3, 4])
    def test_valid_ecog(self, ecog: int) -> None:
        p = PatientProfile(
            age=50,
            sex="male",
            primary_diagnosis=_PrimaryDiag.make(),
            ecog_performance_status=ecog,
        )
        assert p.ecog_performance_status == ecog

    @pytest.mark.parametrize("ecog", [-1, 5, 100])
    def test_invalid_ecog(self, ecog: int) -> None:
        with pytest.raises(ValidationError):
            PatientProfile(
                age=50,
                sex="male",
                primary_diagnosis=_PrimaryDiag.make(),
                ecog_performance_status=ecog,
            )

    def test_ecog_defaults_to_none(self) -> None:
        p = PatientProfile(age=50, sex="male", primary_diagnosis=_PrimaryDiag.make())
        assert p.ecog_performance_status is None

    @pytest.mark.parametrize("sex", ["unknown", "Female", "M", "", None])
    def test_invalid_sex_rejected(self, sex: object) -> None:
        with pytest.raises(ValidationError):
            PatientProfile(age=50, sex=sex, primary_diagnosis=_PrimaryDiag.make())  # type: ignore[arg-type]

    def test_extra_field_rejected(self) -> None:
        with pytest.raises(ValidationError):
            PatientProfile(
                age=50,
                sex="male",
                primary_diagnosis=_PrimaryDiag.make(),
                weight_kg=70,  # type: ignore[call-arg]
            )

    def test_optional_collections_default_empty(self) -> None:
        p = PatientProfile(age=50, sex="male", primary_diagnosis=_PrimaryDiag.make())
        assert p.comorbidities == []
        assert p.current_medications == []
        assert p.lab_values == {}
        assert p.prior_treatments == []


# ---- ClinicalNote -----------------------------------------------------------

class TestClinicalNote:
    def test_text_required(self) -> None:
        with pytest.raises(ValidationError):
            ClinicalNote()  # type: ignore[call-arg]

    def test_empty_text_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ClinicalNote(text="")


# ---- Trial / Criterion ------------------------------------------------------

class TestTrial:
    @pytest.mark.parametrize("nct", ["NCT12345678", "nct00000001"])
    def test_valid_nct_id_normalized(self, nct: str) -> None:
        t = Trial(nct_id=nct, brief_title="x")
        assert t.nct_id == nct.upper()

    @pytest.mark.parametrize("nct", ["NCT1234567", "NCT123456789", "ABC12345678", ""])
    def test_invalid_nct_id_rejected(self, nct: str) -> None:
        with pytest.raises(ValidationError):
            Trial(nct_id=nct, brief_title="x")

    def test_url_property(self) -> None:
        t = Trial(nct_id="NCT12345678", brief_title="x")
        assert t.url == "https://clinicaltrials.gov/study/NCT12345678"

    def test_negative_enrollment_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Trial(nct_id="NCT12345678", brief_title="x", enrollment=-1)


class TestCriterion:
    def test_source_text_required_non_empty(self) -> None:
        with pytest.raises(ValidationError):
            Criterion(
                criterion_type="inclusion",
                category="diagnosis",
                operator="eq",
                source_text="",
            )

    def test_threshold_optional(self) -> None:
        c = Criterion(
            criterion_type="inclusion",
            category="demographic",
            operator="gte",
            source_text="Age >= 18",
        )
        assert c.threshold is None


# ---- Match models -----------------------------------------------------------

def _verdict(score: float) -> TrialVerdict:
    return TrialVerdict(
        nct_id="NCT00000001",
        title="x",
        aggregate_verdict="NEEDS_REVIEW",
        score=score,
    )


class TestCriterionVerdict:
    @pytest.mark.parametrize("conf", [-0.1, 1.1])
    def test_confidence_must_be_in_unit_interval(self, conf: float) -> None:
        with pytest.raises(ValidationError):
            CriterionVerdict(
                criterion=Criterion(
                    criterion_type="inclusion",
                    category="diagnosis",
                    operator="eq",
                    source_text="x",
                ),
                verdict="PASS",
                reasoning="ok",
                confidence=conf,
            )


class TestMatchReport:
    def test_trial_verdicts_sorted_by_score_descending(self) -> None:
        p = PatientProfile(age=50, sex="male", primary_diagnosis=_PrimaryDiag.make())
        report = MatchReport(
            patient=p,
            trial_verdicts=[_verdict(0.2), _verdict(0.9), _verdict(0.5)],
        )
        assert [v.score for v in report.trial_verdicts] == [0.9, 0.5, 0.2]

    def test_default_disclaimer_present(self) -> None:
        p = PatientProfile(age=50, sex="male", primary_diagnosis=_PrimaryDiag.make())
        report = MatchReport(patient=p)
        assert report.disclaimer == DEFAULT_DISCLAIMER


# ---- API request validation -------------------------------------------------

class TestMatchRequest:
    def _patient_dict(self) -> dict[str, object]:
        return {
            "age": 50,
            "sex": "female",
            "primary_diagnosis": {"icd10": "C50.911"},
        }

    def test_structured_happy_path(self) -> None:
        req = MatchRequest(
            input_mode="structured",
            patient=PatientProfile.model_validate(self._patient_dict()),
        )
        assert req.options == MatchOptions()

    def test_structured_requires_patient(self) -> None:
        with pytest.raises(ValidationError):
            MatchRequest(input_mode="structured")

    def test_structured_rejects_clinical_note(self) -> None:
        with pytest.raises(ValidationError):
            MatchRequest(
                input_mode="structured",
                patient=PatientProfile.model_validate(self._patient_dict()),
                clinical_note=ClinicalNote(text="something"),
            )

    def test_note_requires_clinical_note(self) -> None:
        with pytest.raises(ValidationError):
            MatchRequest(input_mode="note")

    def test_note_rejects_patient(self) -> None:
        with pytest.raises(ValidationError):
            MatchRequest(
                input_mode="note",
                clinical_note=ClinicalNote(text="x"),
                patient=PatientProfile.model_validate(self._patient_dict()),
            )

    def test_options_max_results_bounds(self) -> None:
        with pytest.raises(ValidationError):
            MatchOptions(max_results=0)
        with pytest.raises(ValidationError):
            MatchOptions(max_results=51)
