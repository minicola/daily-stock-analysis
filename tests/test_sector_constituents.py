"""板块成分股获取测试"""
import pytest
from data_provider.base import DataFetcherManager


@pytest.mark.network
class TestSectorConstituents:
    """需要网络的集成测试"""

    def setup_method(self):
        self.manager = DataFetcherManager()

    def test_get_sector_constituents_returns_list(self):
        result = self.manager.get_sector_constituents("锂电池")
        assert isinstance(result, list)
        assert len(result) > 0

    def test_constituent_has_required_fields(self):
        result = self.manager.get_sector_constituents("锂电池")
        if len(result) > 0:
            item = result[0]
            assert "code" in item
            assert "name" in item
            assert len(item["code"]) == 6

    def test_industry_board(self):
        result = self.manager.get_sector_constituents("电池", board_type="industry")
        assert isinstance(result, list)

    def test_unknown_board_returns_empty(self):
        result = self.manager.get_sector_constituents("这个板块不存在XYZ")
        assert result == []
