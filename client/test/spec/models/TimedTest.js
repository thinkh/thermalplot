var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var TimedListTest = (function (_super) {
    __extends(TimedListTest, _super);
    function TimedListTest() {
        _super.apply(this, arguments);
        this.t = new PVDTimed.TimedList();
    }
    TimedListTest.prototype.testLength = function () {
        this.t.clear();
        this.areIdentical(0, this.t.length);
        this.t.push(10, "A");
        this.areIdentical(1, this.t.length);
        this.t.push(20, "B");
        this.t.push(30, "C");
        this.areIdentical(3, this.t.length);
    };
    TimedListTest.prototype.testIsEmpty = function () {
        this.t.clear();
        this.isTrue(this.t.isEmpty);
        this.t.push(10, "A");
        this.isFalse(this.t.isEmpty);
    };
    TimedListTest.prototype.testGet = function () {
        this.t.clear();
        this.areIdentical(null, this.t.get(0));
        this.t.push(10, "A");
        this.areIdentical(10, this.t.getTS(0));
    };
    TimedListTest.prototype.setUp = function () {
        this.t.clear();
        this.t.push(1, "1");
        this.t.push(5, "5");
        this.t.push(8, "8");
        this.t.push(9, "9");
        this.t.push(15, "15");
    };
    TimedListTest.prototype.testFloor = function () {
        this.isFalsey(this.t.floor(0));
        this.areIdentical(1, this.t.floor(1).ts);
        this.areIdentical(1, this.t.floor(2).ts);
        this.areIdentical(5, this.t.floor(5).ts);
        this.areIdentical(5, this.t.floor(6).ts);
        this.areIdentical(8, this.t.floor(8).ts);
        this.areIdentical(9, this.t.floor(9).ts);
        this.areIdentical(15, this.t.floor(20).ts);
    };
    TimedListTest.prototype.testCeiling = function () {
        this.areIdentical(1, this.t.ceiling(0).ts);
        this.areIdentical(1, this.t.ceiling(1).ts);
        this.areIdentical(5, this.t.ceiling(2).ts);
        this.areIdentical(5, this.t.ceiling(5).ts);
        this.areIdentical(8, this.t.ceiling(6).ts);
        this.areIdentical(8, this.t.ceiling(8).ts);
        this.areIdentical(9, this.t.ceiling(9).ts);
        this.areIdentical(15, this.t.ceiling(11).ts);
        this.isFalsey(this.t.ceiling(20));
    };
    TimedListTest.prototype.testList = function () {
    };
    TimedListTest.prototype.testFrequencies = function () {
    };
    TimedListTest.prototype.testFrequencyList = function () {
    };
    return TimedListTest;
})(tsUnit.TestClass);
//# sourceMappingURL=TimedTest.js.map