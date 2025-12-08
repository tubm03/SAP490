sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'project2',
            componentId: 'Z4C_APPR_ATTACHList',
            contextPath: '/Z4C_APPR_ATTACH'
        },
        CustomPageDefinitions
    );
});