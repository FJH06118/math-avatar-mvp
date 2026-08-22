from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from backend.powerpoint_animation_adapter import (
    AnimationAdapterError,
    cleanup_powerpoint_from_state,
    extract_animation_manifest,
    run_powerpoint_adapter,
)


class FakeCollection:
    def __init__(self, values: list[object]) -> None:
        self.values = values
        self.Count = len(values)

    def Item(self, index: int) -> object:
        return self.values[index - 1]


def shape(shape_id: int, name: str) -> SimpleNamespace:
    return SimpleNamespace(
        Id=shape_id,
        Name=name,
        Type=17,
        Left=100.0,
        Top=150.0,
        Width=300.0,
        Height=80.0,
    )


def timing(
    trigger_type: int,
    *,
    trigger_shape: object | None = None,
    delay: float = 0.0,
    duration: float = 0.5,
    repeat_count: float = 1.0,
    repeat_duration: float = 0.0,
    auto_reverse: int = 0,
) -> SimpleNamespace:
    return SimpleNamespace(
        TriggerType=trigger_type,
        TriggerShape=trigger_shape,
        TriggerDelayTime=delay,
        Duration=duration,
        RepeatCount=repeat_count,
        RepeatDuration=repeat_duration,
        AutoReverse=auto_reverse,
    )


def effect(
    index: int,
    effect_type: int,
    target: object,
    effect_timing: object,
    *,
    exit_value: int = 0,
) -> SimpleNamespace:
    return SimpleNamespace(
        Index=index,
        EffectType=effect_type,
        Exit=exit_value,
        Shape=target,
        Paragraph=0,
        TextRangeStart=0,
        TextRangeLength=4,
        Timing=effect_timing,
    )


def presentation_fixture(*, unknown_effect: bool = False) -> SimpleNamespace:
    title = shape(2, "中文标题")
    derivation = shape(3, "逐步推导")
    answer = shape(4, "答案展示")
    trigger = shape(5, "点击显示答案")
    main = FakeCollection([
        effect(1, 1, title, timing(1, delay=0.1, duration=0.5)),
        effect(
            2,
            99_999 if unknown_effect else 61,
            derivation,
            timing(2, delay=0.2, duration=1.25, repeat_count=2, auto_reverse=-1),
        ),
        effect(3, 10, derivation, timing(3, delay=0.3, duration=0.75), exit_value=-1),
    ])
    interactive = FakeCollection([
        effect(1, 10, answer, timing(4, trigger_shape=trigger, delay=0.15, duration=0.6)),
    ])
    first = SimpleNamespace(
        TimeLine=SimpleNamespace(
            MainSequence=main,
            InteractiveSequences=FakeCollection([interactive]),
        ),
        SlideShowTransition=SimpleNamespace(
            EntryEffect=1793,
            Duration=1.0,
            AdvanceOnClick=-1,
            AdvanceOnTime=-1,
            AdvanceTime=4.0,
        ),
    )
    second = SimpleNamespace(
        TimeLine=SimpleNamespace(
            MainSequence=FakeCollection([]),
            InteractiveSequences=FakeCollection([]),
        ),
        SlideShowTransition=SimpleNamespace(
            EntryEffect=0,
            Duration=0.0,
            AdvanceOnClick=-1,
            AdvanceOnTime=0,
            AdvanceTime=0.0,
        ),
    )
    return SimpleNamespace(
        Slides=FakeCollection([first, second]),
        PageSetup=SimpleNamespace(SlideWidth=960.0, SlideHeight=540.0),
    )


class FakePythonCom:
    def __init__(self) -> None:
        self.initialized = 0
        self.uninitialized = 0

    def CoInitialize(self) -> None:
        self.initialized += 1

    def CoUninitialize(self) -> None:
        self.uninitialized += 1


class FakePresentation(SimpleNamespace):
    closed = False

    def Close(self) -> None:
        self.closed = True


class FakeApplication:
    def __init__(self, opened: FakePresentation, *, open_error: bool = False) -> None:
        self.opened = opened
        self.open_error = open_error
        self.AutomationSecurity = 0
        self.DisplayAlerts = 0
        self.quit_called = False
        self.open_args: tuple[tuple[object, ...], dict[str, object]] | None = None
        self.Presentations = self

    def Open(self, *args: object, **kwargs: object) -> FakePresentation:
        self.open_args = (args, kwargs)
        if self.open_error:
            raise RuntimeError("private COM detail")
        return self.opened

    def Quit(self) -> None:
        self.quit_called = True


class SecurityFailApplication:
    def __init__(self) -> None:
        self.quit_called = False

    @property
    def AutomationSecurity(self) -> int:
        return 0

    @AutomationSecurity.setter
    def AutomationSecurity(self, _value: int) -> None:
        raise RuntimeError("security configuration unavailable")

    def Quit(self) -> None:
        self.quit_called = True


class PowerPointAnimationAdapterTests(unittest.TestCase):
    def test_cleanup_state_never_terminates_a_non_powerpoint_pid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            state.write_text(
                json.dumps({
                    "schemaVersion": 1,
                    "powerPointProcessId": os.getpid(),
                    "status": "EXTRACTING",
                }),
                encoding="utf-8",
            )
            self.assertFalse(cleanup_powerpoint_from_state(state))

    def test_extracts_main_interactive_timing_shapes_and_transition_in_order(self) -> None:
        manifest = extract_animation_manifest(
            presentation_fixture(),
            source_file_sha256="a" * 64,
        )
        first = manifest["slides"][0]
        self.assertEqual([sequence["kind"] for sequence in first["sequences"]], ["MAIN", "INTERACTIVE"])
        effects = [item for sequence in first["sequences"] for item in sequence["effects"]]
        self.assertEqual([item["order"] for item in effects], [1, 2, 3, 1])
        self.assertEqual([item["timing"]["trigger"]["type"]["rawValue"] for item in effects], [1, 2, 3, 4])
        self.assertEqual([item["timing"]["durationSeconds"] for item in effects], [0.5, 1.25, 0.75, 0.6])
        self.assertEqual([item["timing"]["triggerDelaySeconds"] for item in effects], [0.1, 0.2, 0.3, 0.15])
        self.assertEqual(effects[1]["timing"]["repeatCount"], 2.0)
        self.assertTrue(effects[1]["timing"]["autoReverse"])
        self.assertEqual(effects[2]["category"], "EXIT")
        self.assertEqual(effects[3]["timing"]["trigger"]["shape"]["name"], "点击显示答案")
        self.assertEqual(first["transition"]["entryEffect"]["rawValue"], 1793)
        self.assertEqual(first["transition"]["advanceTimeSeconds"], 4.0)
        self.assertEqual(manifest["slides"][1]["effectCount"], 0)

        repeated = extract_animation_manifest(
            presentation_fixture(),
            source_file_sha256="a" * 64,
        )
        self.assertEqual(manifest["id"], repeated["id"])
        self.assertEqual(
            effects[0]["shape"]["id"],
            repeated["slides"][0]["sequences"][0]["effects"][0]["shape"]["id"],
        )

    def test_unknown_effect_keeps_raw_enum_and_explicit_review_warning(self) -> None:
        manifest = extract_animation_manifest(
            presentation_fixture(unknown_effect=True),
            source_file_sha256="b" * 64,
        )
        unknown = manifest["slides"][0]["sequences"][0]["effects"][1]
        self.assertEqual(unknown["effectType"]["rawValue"], 99_999)
        self.assertFalse(unknown["effectType"]["known"])
        self.assertIn("UNSUPPORTED_REQUIRES_REVIEW", unknown["supportAssessment"]["levels"])
        self.assertIn("UNKNOWN_ANIMATION_EFFECT", [item["code"] for item in unknown["warnings"]])

    def test_custom_motion_path_and_media_effects_are_never_silently_whitelisted(self) -> None:
        expected = {
            0: "CUSTOM_ANIMATION",
            100: "COMPLEX_MOTION_PATH",
            83: "MEDIA_TRIGGER_OR_EFFECT",
        }
        for raw_value, warning_code in expected.items():
            with self.subTest(raw_value=raw_value):
                fixture = presentation_fixture()
                fixture.Slides.Item(1).TimeLine.MainSequence.values[0].EffectType = raw_value
                manifest = extract_animation_manifest(
                    fixture,
                    source_file_sha256=f"{raw_value % 10}" * 64,
                )
                extracted = manifest["slides"][0]["sequences"][0]["effects"][0]
                self.assertEqual(extracted["effectType"]["rawValue"], raw_value)
                self.assertIn(warning_code, [item["code"] for item in extracted["warnings"]])
                self.assertIn("UNSUPPORTED_REQUIRES_REVIEW", extracted["supportAssessment"]["levels"])

    def test_morph_marker_is_preserved_as_native_playback_review_boundary(self) -> None:
        manifest = extract_animation_manifest(
            presentation_fixture(),
            source_file_sha256="e" * 64,
            morph_slides={1},
        )
        transition = manifest["slides"][0]["transition"]
        self.assertTrue(transition["morphDetected"])
        self.assertIn("MORPH_TRANSITION", [item["code"] for item in transition["warnings"]])
        self.assertIn("UNSUPPORTED_REQUIRES_REVIEW", transition["supportAssessment"]["levels"])

    def test_lifecycle_uses_dispatch_ex_macro_disable_read_only_and_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "中文动画.pptx"
            source.write_bytes(b"fixture")
            opened = FakePresentation(**presentation_fixture().__dict__)
            app = FakeApplication(opened)
            pythoncom = FakePythonCom()
            manifest = run_powerpoint_adapter(
                source,
                root / "manifest.json",
                root / "state.json",
                dispatch_ex=lambda prog_id: app if prog_id == "PowerPoint.Application" else None,
                pythoncom_module=pythoncom,
                process_id_getter=lambda _application: 4242,
                process_ids_getter=lambda: set(),
            )
            self.assertEqual(manifest["metadataSource"], "POWERPOINT_COM")
            self.assertEqual(app.AutomationSecurity, 3)
            assert app.open_args is not None
            self.assertEqual(
                app.open_args[1],
                {"ReadOnly": True, "Untitled": False, "WithWindow": False},
            )
            self.assertTrue(opened.closed)
            self.assertTrue(app.quit_called)
            self.assertEqual((pythoncom.initialized, pythoncom.uninitialized), (1, 1))
            state = json.loads((root / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(state, {"schemaVersion": 1, "powerPointProcessId": 4242, "status": "CLOSED"})

    def test_open_failure_returns_stable_error_and_still_cleans_up(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "损坏文件.pptx"
            source.write_bytes(b"broken")
            opened = FakePresentation(**presentation_fixture().__dict__)
            app = FakeApplication(opened, open_error=True)
            pythoncom = FakePythonCom()
            with self.assertRaises(AnimationAdapterError) as raised:
                run_powerpoint_adapter(
                    source,
                    root / "manifest.json",
                    root / "state.json",
                    dispatch_ex=lambda _prog_id: app,
                    pythoncom_module=pythoncom,
                    process_id_getter=lambda _application: 4243,
                    process_ids_getter=lambda: set(),
                )
            self.assertEqual(raised.exception.code, "POWERPOINT_FILE_OPEN_FAILED")
            self.assertNotIn("private COM detail", raised.exception.public_message)
            self.assertTrue(app.quit_called)
            self.assertEqual((pythoncom.initialized, pythoncom.uninitialized), (1, 1))

    def test_missing_com_returns_actionable_error_and_balances_com_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "missing-com.pptx"
            source.write_bytes(b"fixture")
            pythoncom = FakePythonCom()

            def unavailable(_prog_id: str) -> object:
                raise RuntimeError("class not registered at C:\\private")

            with self.assertRaises(AnimationAdapterError) as raised:
                run_powerpoint_adapter(
                    source,
                    root / "manifest.json",
                    root / "state.json",
                    dispatch_ex=unavailable,
                    pythoncom_module=pythoncom,
                    process_ids_getter=lambda: set(),
                )
            self.assertEqual(raised.exception.code, "POWERPOINT_COM_UNAVAILABLE")
            self.assertNotIn("private", raised.exception.public_message)
            self.assertEqual((pythoncom.initialized, pythoncom.uninitialized), (1, 1))

    def test_macro_security_failure_stops_before_opening_untrusted_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "macro-enabled.pptx"
            source.write_bytes(b"fixture")
            pythoncom = FakePythonCom()
            app = SecurityFailApplication()
            with self.assertRaises(AnimationAdapterError) as raised:
                run_powerpoint_adapter(
                    source,
                    root / "manifest.json",
                    root / "state.json",
                    dispatch_ex=lambda _prog_id: app,
                    pythoncom_module=pythoncom,
                    process_ids_getter=lambda: set(),
                )
            self.assertEqual(raised.exception.code, "POWERPOINT_SECURITY_CONFIGURATION_FAILED")
            self.assertTrue(app.quit_called)
            self.assertFalse((root / "manifest.json").exists())

    def test_malformed_sequence_fails_the_whole_metadata_claim_instead_of_dropping_effects(self) -> None:
        fixture = presentation_fixture()

        class BrokenSequence(FakeCollection):
            def Item(self, index: int) -> object:
                if index == 2:
                    raise RuntimeError("untrusted shape internals")
                return super().Item(index)

        fixture.Slides.Item(1).TimeLine.MainSequence = BrokenSequence(
            fixture.Slides.Item(1).TimeLine.MainSequence.values
        )
        with self.assertRaises(AnimationAdapterError) as raised:
            extract_animation_manifest(fixture, source_file_sha256="d" * 64)
        self.assertEqual(raised.exception.code, "POWERPOINT_ANIMATION_INVALID")


if __name__ == "__main__":
    unittest.main()
