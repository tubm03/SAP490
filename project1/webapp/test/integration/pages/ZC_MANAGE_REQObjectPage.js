sap.ui.define(['sap/fe/test/ObjectPage'], function(ObjectPage) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ObjectPage(
        {
            appId: 'project1',
            componentId: 'ZC_MANAGE_REQObjectPage',
            contextPath: '/ZC_MANAGE_REQ'
        },
        CustomPageDefinitions
    );
});