sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"project1/test/integration/pages/ZC_MANAGE_REQList",
	"project1/test/integration/pages/ZC_MANAGE_REQObjectPage"
], function (JourneyRunner, ZC_MANAGE_REQList, ZC_MANAGE_REQObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('project1') + '/test/flp.html#app-preview',
        pages: {
			onTheZC_MANAGE_REQList: ZC_MANAGE_REQList,
			onTheZC_MANAGE_REQObjectPage: ZC_MANAGE_REQObjectPage
        },
        async: true
    });

    return runner;
});

