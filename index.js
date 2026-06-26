const { I18nManager } = require('react-native');

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
I18nManager.swapLeftAndRightInRTL(true);

require('expo-router/entry');
