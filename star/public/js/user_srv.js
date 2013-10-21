/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */

//this service assusmes there is an html element that containst he user data wiht the user_data id
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.service('nbUserSrv', [
		'$http', '$rootScope', UserSrv
	]);

	function UserSrv($http, $rootScope) {
		this.user = JSON.parse($('#user_data').html());
	}

	UserSrv.prototype.get_user = function() {
		if (this.user) {
			return this.user;
		}
	};

	// UserSrv.prototype.get_fbid = function() {
	// 	if (this.user && this.user.fbid) {
	// 		return this.user.fbid;
	// 	}
	// 	return null;
	// };

	// UserSrv.prototype.get_googleid = function() {
	// 	if (this.user && this.user.googleid) {
	// 		return this.user.googleid;
	// 	}
	// 	return null;
	// };

	UserSrv.prototype.has_token = function(provider) {
		// console.log('in HAS TOKEN!!!!', this.user.tokens);
		
		if (this.user && this.user.tokens) {
			return !!this.user.tokens[provider];
		}
		return null;
	};

	// UserSrv.prototype.has_google_token = function() {
	// 	return this.has_token('google');
	// };
	// UserSrv.prototype.has_fb_token = function() {
	// 	console.log('in HAS FB TOKEN!!!!');
	// 	return this.has_token('fb');
	// };

})();