'use strict';

// this module requires the dot template engine and replaces 
// the dot regexp to use <? ?> to avoid collision with angular {{ }}
//
// important - dot settings should run before any require() that 
// might use dot directly or else the it will get mess up (like the email.js code)

var dot = require('dot');

dot.templateSettings.strip = false;
dot.templateSettings.cache = true;

for (var i in dot.templateSettings) {
    var reg = dot.templateSettings[i];
    if (!(reg instanceof RegExp)) {
        continue;
    }
    var pattern = reg.source;
    pattern = pattern.replace(/\\\{\\\{/g, '\\<\\?');
    pattern = pattern.replace(/\\\}\\\}/g, '\\?\\>');
    var flags = '';
    if (reg.global) {
        flags += 'g';
    }
    if (reg.ignoreCase) {
        flags += 'i';
    }
    if (reg.multiline) {
        flags += 'm';
    }
    dot.templateSettings[i] = new RegExp(pattern, flags);
}

module.exports = dot;
