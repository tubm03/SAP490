sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"zmanagematrixv4/test/integration/pages/Z4C_APPROVE_CONDITIONMain"
], function (JourneyRunner, Z4C_APPROVE_CONDITIONMain) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('zmanagematrixv4') + '/test/flp.html#app-preview',
        pages: {
			onTheZ4C_APPROVE_CONDITIONMain: Z4C_APPROVE_CONDITIONMain
        },
        async: true
    });

    return runner;
});

