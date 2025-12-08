sap.ui.define([
    "sap/ui/test/opaQunit",
    "./pages/JourneyRunner"
], function (opaTest, runner) {
    "use strict";

    function journey() {
        QUnit.module("First journey");

        opaTest("Start application", function (Given, When, Then) {
            Given.iStartMyApp();

            Then.onTheZ4C_APPR_ATTACHList.iSeeThisPage();

        });


        opaTest("Navigate to ObjectPage", function (Given, When, Then) {
            // Note: this test will fail if the ListReport page doesn't show any data
            
            When.onTheZ4C_APPR_ATTACHList.onFilterBar().iExecuteSearch();
            
            Then.onTheZ4C_APPR_ATTACHList.onTable().iCheckRows();

            When.onTheZ4C_APPR_ATTACHList.onTable().iPressRow(0);
            Then.onTheZ4C_APPR_ATTACHObjectPage.iSeeThisPage();

        });

        opaTest("Teardown", function (Given, When, Then) { 
            // Cleanup
            Given.iTearDownMyApp();
        });
    }

    runner.run([journey]);
});