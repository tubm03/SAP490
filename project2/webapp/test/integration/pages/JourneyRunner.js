sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"project2/test/integration/pages/Z4C_APPR_ATTACHList",
	"project2/test/integration/pages/Z4C_APPR_ATTACHObjectPage"
], function (JourneyRunner, Z4C_APPR_ATTACHList, Z4C_APPR_ATTACHObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('project2') + '/test/flp.html#app-preview',
        pages: {
			onTheZ4C_APPR_ATTACHList: Z4C_APPR_ATTACHList,
			onTheZ4C_APPR_ATTACHObjectPage: Z4C_APPR_ATTACHObjectPage
        },
        async: true
    });

    return runner;
});

