var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var VisUtilsTest = (function (_super) {
    __extends(VisUtilsTest, _super);
    function VisUtilsTest() {
        _super.apply(this, arguments);
    }
    VisUtilsTest.prototype.testTsNormalizer = function () {
        var v = PVDVisualizations.tsNormalizer(0, 1000);
        this.areIdentical(2, v(1000));
        this.areIdentical(2, v(1001));
        this.areIdentical(2, v(1249));
        this.areIdentical(2, v(1251));
        this.areIdentical(2, v(1260));
        this.areIdentical(3, v(1490));
        this.areIdentical(4, v(1800));
        this.areIdentical(4, v(2000));
        this.areIdentical(4, v(2200));
        this.areIdentical(5, v(2500));
    };
    return VisUtilsTest;
})(tsUnit.TestClass);
//# sourceMappingURL=VisUtilsTest.js.map