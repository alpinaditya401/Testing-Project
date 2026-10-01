"""Exercise the real CLI and JSON decoding; only HTTP transport is mocked."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    'simulator_device', Path(__file__).resolve().parents[1] / 'simulator_device.py')
simulator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(simulator)


def command(**changes):
    row = {'id': '0123456789abcdef0123456789abcdef', 'simulation': True,
           'actuator': 'aerator', 'value': True, 'duration': 0}
    row.update(changes)
    return row


class SimulatorValidationTests(unittest.TestCase):
    def run_payload(self, payload):
        self.requests = []
        self.output = io.StringIO()

        def transport(_client, request, timeout):
            self.requests.append(request)
            response = payload if request.get_method() == 'GET' else {'ok': True}
            return io.BytesIO(json.dumps(response).encode())

        argv = ['simulator_device.py', '--base-url', 'http://127.0.0.1:8765',
                '--device-id', 'AQS-KOLAM-01', '--once']
        with patch.object(sys, 'argv', argv), patch.dict(
                os.environ, {'AQUASMART_DEVICE_KEY': 'unit-test-only'}), \
                patch.object(simulator.urllib.request.OpenerDirector, 'open', transport), \
                contextlib.redirect_stdout(self.output):
            simulator.main()

    def assert_rejected(self, payload):
        with self.assertRaises(RuntimeError):
            self.run_payload(payload)
        self.assertEqual([r.get_method() for r in self.requests], ['GET'])
        self.assertEqual(self.output.getvalue(), '')

    def test_malformed_objects_fail_with_validation_error(self):
        payloads = [None, [], 'bad', 1, {}, {'commands': [None]}, {'commands': [[]]}]
        for field in command():
            row = command()
            del row[field]
            payloads.append({'commands': [row]})
        for payload in payloads:
            with self.subTest(payload=payload):
                try:
                    self.assert_rejected(payload)
                except (TypeError, KeyError, AttributeError) as exc:
                    self.fail(f'Malformed schema leaked {type(exc).__name__} instead of validation error')

    def test_commands_must_be_an_array(self):
        for commands in ({}, '', None, 0, True):
            with self.subTest(commands=commands):
                self.assert_rejected({'commands': commands})

    def test_malformed_batch_has_no_partial_ack(self):
        self.assert_rejected({'commands': [command(), command(id='f'*32, value='false')]})

    def test_actuator_specific_duration_limits(self):
        for actuator, durations in (('feeder', (0, -1, 31, 1.0, '1', None)),
                                   ('aerator', (1, 30, -1)), ('auto', (1, 30, -1))):
            for duration in durations:
                with self.subTest(actuator=actuator, duration=duration):
                    self.assert_rejected({'commands': [command(actuator=actuator, duration=duration)]})

    def test_non_boolean_values_are_rejected(self):
        for value in (0, 1, 'true', 'false', None, [], {}):
            with self.subTest(value=value):
                self.assert_rejected({'commands': [command(value=value)]})

    def test_invalid_command_ids_are_rejected(self):
        for identifier in ('', '../escape', 'a/b', 'x?status=bad', 'a'*31,
                           'a'*33, 'g'*32, 'A'*32, 'a'*32+'\n'):
            with self.subTest(identifier=identifier):
                self.assert_rejected({'commands': [command(id=identifier)]})

    def test_unknown_actuators_are_rejected(self):
        for actuator in ('pump', '', 'FEEDER', None, 1, [], {}):
            with self.subTest(actuator=actuator):
                self.assert_rejected({'commands': [command(actuator=actuator)]})

    def test_boolean_durations_are_rejected(self):
        for duration in (True, False):
            with self.subTest(duration=duration):
                self.assert_rejected({'commands': [command(duration=duration)]})


if __name__ == '__main__':
    unittest.main(verbosity=2)
