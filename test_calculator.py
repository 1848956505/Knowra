"""验证课程示例的正常输入、零、负数和小数。"""

import pytest

from calculator import add, multiply


def test_add():
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    assert add(0, 0) == 0
    assert add(-2, -3) == -5
    assert add(0.1, 0.2) == pytest.approx(0.3)


def test_multiply():
    assert multiply(3, 4) == 12
    assert multiply(2, 0) == 0
    assert multiply(-3, 4) == -12
    assert multiply(-3, -4) == 12
    assert multiply(0.5, 0.2) == pytest.approx(0.1)
