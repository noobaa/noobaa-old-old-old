/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');


	///////////////////
	// ROUTES CONFIG //
	///////////////////


	noobaa_app.config(function($routeProvider, $locationProvider) {
		$locationProvider.html5Mode(true);
		$routeProvider.when('/feed/', {
			templateUrl: '/public/html/feed_template.html',
			controller: ['$scope',
				function($scope) {
					$scope.refresh_feeds();
				}
			]
		}).when('/items/:path*?', {
			template: [
				'<div class="container">',
				'	<div nb-browse ng-if="home_context" context="home_context" notify-layout="angular.noop"></div>',
				'</div>'
			].join('\n')
		}).when('/friends/', {
			templateUrl: '/public/html/friends_template.html',
			controller: ['$scope',
				function($scope) {
					$scope.refresh_friends();
				}
			]
		}).otherwise({
			redirectTo: '/feed/'
		});
	});



	/////////////////////
	// HOME CONTROLLER //
	/////////////////////


	noobaa_app.controller('HomeCtrl', [
		'$scope', '$http', '$timeout', '$interval', '$window', '$location', '$compile',
		'nbUtil', 'nbMultiSelect', 'nbUser', 'nbInode', 'nbUploadSrv', 'nbPlanet',
		function($scope, $http, $timeout, $interval, $window, $location, $compile,
			nbUtil, nbMultiSelect, nbUser, nbInode, nbUploadSrv, nbPlanet) {
			$scope.nbUtil = nbUtil;
			$scope.nbMultiSelect = nbMultiSelect;
			$scope.nbUser = nbUser;
			$scope.nbInode = nbInode;
			$scope.nbUploadSrv = nbUploadSrv;
			$scope.nbPlanet = nbPlanet;

			$scope.refresh_feeds = refresh_feeds;
			$scope.root_dir = nbInode.init_root_dir();

			$scope.refresh_friends = refresh_friends;
			$scope.present_map = present_map;
			$scope.set_fb_invites = set_fb_invites;
			$scope.send_fb_invites = send_fb_invites;
			$scope.set_google_invites = set_google_invites;
			$scope.send_google_invites = send_google_invites;
			$scope.send_friend_message = send_friend_message;

			$scope.home_context = {
				current_inode: $scope.root_dir,
				selection: {
					items: [],
					source_index: function(i) {
						return $scope.home_context.current_inode.entries[i];
					}
				}
			};

			nbUtil.track_event('home.load', {
				client: !! nbPlanet.on
			});

			if (nbUser.user) {

				nbUser.update_user_info();

				init_read_dir();
			}

			function init_read_dir() {
				// nbInode.read_all($scope.root_dir).then(function(res) {
				nbInode.read_dir($scope.root_dir).then(function(res) {
					console.log('ROOT FOLDERS', res);
					var entries = $scope.root_dir.entries;
					for (var i = 0; i < entries.length; i++) {
						var e = entries[i];
						e.level = 1;
						if (e.name === 'My Data') {
							$scope.mydata = e;
						} else if (e.name === 'Shared With Me') {
							$scope.swm = e;
							e.swm = true;
						} else {
							console.error('UNRECOGNIZED ROOT FOLDER', e);
						}
					}
					refresh_feeds();
					return res;
				}, function(err) {
					console.error('GET ROOT FOLDERS FAILED', err);
					return $timeout(init_read_dir, 3000);
				});
			}

			function refresh_feeds() {
				console.log('READ SWM', $scope.swm);
				// console.log('READ SWM', $scope.home_context.current_inode);
				if (!$scope.swm) {
					return;
				}
				$scope.swm.sorting_func = function(a, b) {
					return a.ctime_date > b.ctime_date ? -1 : 1;
				};
				$scope.refreshing_feeds = true;
				nbInode.read_dir($scope.swm).then(function(res) {
					// nbInode.read_dir($scope.home_context.current_inode).then(function(res) {
					console.log('SWM FOLDER', res);
					$scope.refreshing_feeds = false;
					$scope.feeds = $scope.swm.entries;
					// $scope.feeds = $scope.home_context.current_inode.entries;
					$scope.feeds_limit = 10;
					rebuild_layout();
					return res;
				}, function(err) {
					console.error('GET SWM FOLDER FAILED', err);
					$scope.refreshing_feeds = false;
					throw err;
				});
			}

			$scope.filter_content_kind = '';

			$scope.more_feeds = function() {
				$scope.feeds_limit += 10;
				rebuild_layout();
				nbUtil.track_event('home.feed.scroll', {
					count: $scope.feeds_limit
				});
			};

			function do_layout() {
				console.log('LAYOUT');
				$timeout.cancel($scope.do_layout_timeout);
				$timeout.cancel($scope.do_layout_fast_timeout);
				$scope.do_layout_timeout = null;
				$scope.do_layout_fast_timeout = null;
				if ($scope.should_rebuild_layout) {
					$scope.should_rebuild_layout = false;
					if ($scope.masonry) {
						$scope.masonry.destroy();
						$scope.masonry = null;
					}
				}
				if ($scope.masonry) {
					$scope.masonry.layout();
				} else {
					var elem = $('.feeds_container');
					if (!elem.length) {
						return;
					}
					var x = window.scrollX;
					var y = window.scrollY;
					$scope.masonry = new Masonry(elem[0], {
						itemSelector: '.feed_item',
						columnWidth: 300,
						gutter: 20
					});
					window.scrollTo(x, y);
				}
			}

			function rebuild_layout() {
				$scope.should_rebuild_layout = true;
				if (!$scope.do_layout_fast_timeout) {
					$scope.do_layout_fast_timeout = $timeout(do_layout, 1);
				}
			}

			$scope.notify_layout = function() {
				if (!$scope.do_layout_timeout) {
					$scope.do_layout_timeout = $timeout(do_layout, 50);
				}
			};


			nbUploadSrv.get_upload_target = function(event) {
				var src_dev_id = nbPlanet.on ? nbPlanet.get_source_device_id() : undefined;
				// see inode_upload()
				var inode_upload = $(event.target).data('inode_upload');
				if (inode_upload) {
					return {
						inode_id: inode_upload.id,
						src_dev_id: src_dev_id
					};
				}

				console.log('UP', $scope.home_context);
				var dir_inode = $scope.home_context.current_inode;
				if (nbInode.can_upload_to_dir(dir_inode)) {
					return {
						dir_inode_id: dir_inode.id,
						src_dev_id: src_dev_id
					};
				}
				if (nbInode.can_upload_to_dir($scope.mydata)) {
					console.log('upload to mydata - since current_inode is', dir_inode);
					return {
						dir_inode_id: $scope.mydata.id,
						src_dev_id: src_dev_id
					};
				}
				console.error('bailing upload');
				return false;
			};


			$scope.show_client_installation = function() {
				nbUtil.track_event('home.install.show');
				nbUtil.content_modal('Install Client', $('#client_installation').html(), $scope);
			};

			$scope.show_client_expansion = function() {
				nbUtil.track_event('home.space.show');
				nbUtil.content_modal('Choose Space Plan', $('#client_expansion').html(), $scope);
			};

			var feedback_dialog = $('#feedback_dialog');

			$scope.click_feedback = function() {
				$scope.feedback_send_done = false;
				// feedback_dialog.nbdialog('open');
				feedback_dialog.modal('show');
			};

			$scope.send_feedback = function() {
				// add to persistent local storage, and return immediately
				// the worker will send in background
				$scope.feedbacks.push($scope.feedback_text);
				localStorage.feedbacks = JSON.stringify($scope.feedbacks);
				$scope.feedback_send_done = true;
				$scope.feedback_text = '';
				$scope.feedback_worker();
			};

			$scope.feedback_worker = function() {
				if ($scope.feedback_promise) {
					return;
				}
				if (!$scope.feedbacks.length) {
					return;
				}
				console.log('sending feedback.', 'queue:', $scope.feedbacks.length);
				$scope.feedback_promise = $http({
					method: 'POST',
					url: '/api/user/feedback/',
					data: {
						feedback: $scope.feedbacks[0]
					}
				}).then(function() {
					console.log('SENT FEEDBACK, REMAIN', $scope.feedbacks.length);
					$scope.feedbacks.shift(); // remove sent element
					localStorage.feedbacks = JSON.stringify($scope.feedbacks);
					$scope.feedback_promise = null;
					$timeout($scope.feedback_worker, 1000);
				}, function(err) {
					console.error('FAILED FEEDBACK (will retry)', err);
					$scope.feedback_promise = null;
					$timeout($scope.feedback_worker, 5000);
				});
			};

			$scope.feedbacks = localStorage.feedbacks ?
				JSON.parse(localStorage.feedbacks) : [];
			$scope.feedback_worker();


			function refresh_friends() {
				nbUtil.track_event('home.friends.show');
				$scope.fb_invites = {};
				$scope.google_invites = {};
				$scope.sending_fb_invites = false;
				$http({
					method: 'GET',
					url: '/api/user/friends/'
				}).then(function(res) {
					console.log('GOT FRIENDS', res);
					$scope.friends = res.data;
				}, function(err) {
					console.error('FAILED GET FRIENDS', err);
				});
			}

			function present_map(list, key) {
				var map = {};
				for (var i = 0; i < list.length; i++) {
					map[list[i][key]] = true;
				}
				return map;
			}

			function set_fb_invites(arg) {
				if (arg === true) {
					$scope.fb_invites = present_map($scope.friends.fb, 'fbid');
				} else if (arg === false) {
					$scope.fb_invites = {};
				} else {
					if ($scope.fb_invites[arg]) {
						delete $scope.fb_invites[arg];
					} else {
						$scope.fb_invites[arg] = true;
					}
				}
			}

			function set_google_invites(arg) {
				if (arg === true) {
					$scope.google_invites = present_map($scope.friends.google, 'googleid');
				} else if (arg === false) {
					$scope.google_invites = {};
				} else {
					if ($scope.google_invites[arg]) {
						delete $scope.google_invites[arg];
					} else {
						$scope.google_invites[arg] = true;
					}

				}
			}

			function send_fb_invites() {
				nbUtil.track_event('home.friends.fb_invite');
				var fbids = _.keys($scope.fb_invites);
				$scope.sending_fb_invites = true;
				snd();

				function snd() {
					var now = _.first(fbids, 50);
					fbids = _.rest(fbids, 50);
					FB.ui({
						method: 'apprequests',
						to: now,
						title: 'NooBaa',
						message: 'Lets share videos on NooBaa!',
						data: nbUser.user.id
					}, function(res) {
						console.log('FB APP REQUESTS', res);
						if (!fbids.length || res.error_code) {
							$scope.sending_fb_invites = false;
						} else {
							snd(); // async loop
						}
					});
				}
			}

			function send_google_invites() {
				console.log('TODO send_google_invites');
			}

			function send_friend_message(friend) {
				console.log(ga);
				if (friend.fbid) {
					FB.ui({
						method: 'send',
						to: friend.fbid, // only single target is possible
						link: 'https://www.noobaa.com?fbsender=' + nbUser.user.id
					}, function(res) {
						console.log('FB SEND', res);
					});
				} else {
					console.log('TODO send_friend_message to googleid');
				}
			}
		}
	]);



	/////////////////////
	// FEED CONTROLLER //
	/////////////////////


	noobaa_app.controller('FeedCtrl', [
		'$scope', '$location', 'nbInode',
		function($scope, $location, nbInode) {
			$scope.index = 0;
			if ($scope.feed.isdir) {
				nbInode.read_dir($scope.feed).then(function() {
					for (var i = 0; i < $scope.feed.entries.length; i++) {
						var e = $scope.feed.entries[i];
						if (e.content_kind === 'image') {
							$scope.index = i;
							break;
						}
					}
				});
				$scope.current_item = function() {
					return $scope.feed.entries ? $scope.feed.entries[$scope.index] : null;
				};
				$scope.next_index = function() {
					$scope.index++;
					$scope.notify_layout();
				};
				$scope.prev_index = function() {
					$scope.index--;
					$scope.notify_layout();
				};
				$scope.media_events = {
					load: $scope.notify_layout,
					ended: function() {
						console.log('MEDIA ENDED', $scope.feed.entries[$scope.index]);
						$scope.next_index();
					},
					open_dir: function() {
						console.log('OPEN DIR');
						// $scope.home_context.current_inode = $scope.feed.entries[$scope.index];
					},
				};
			} else {
				$scope.current_item = function() {
					return $scope.feed;
				};
				$scope.media_events = {
					load: $scope.notify_layout,
					ended: function() {
						console.log('MEDIA ENDED', $scope.feed);
					},
					open_dir: function() {
						console.log('OPEN DIR');
						// $scope.home_context.current_inode = $scope.feed;
					},
				};
			}

			$scope.open_feed_inode = function(feed) {
				if (feed.isdir) {
					$scope.home_context.current_inode = feed;
				} else {
					$scope.home_context.current_inode = feed.parent;
					// feed.is_previewing = true;
					// feed.is_selected = true;
					// TODO select item
				}
				$location.path('/items/');
			};

			$scope.keep_and_share_feed = function() {
				$scope.running_kns = true;
				nbInode.keep_and_share_all($scope.feed).then(function() {
					$scope.running_kns = false;
					$scope.done_kns = true;
				}, function(err) {
					console.error('FAILED KEEP AND SHARE FEED', err);
					$scope.running_kns = false;
				});
			};
		}
	]);



	//////////////////////
	// BROWSE DIRECTIVE //
	//////////////////////


	noobaa_app.directive('nbBrowse', function() {
		return {
			replace: true,
			templateUrl: '/public/html/browse_template.html',
			scope: { // isolated scope
				context: '='
			},
			controller: [
				'$scope', '$http', '$timeout', '$q', '$compile', '$rootScope',
				'nbUtil', 'nbMultiSelect', 'nbUser', 'nbInode', 'nbUploadSrv', 'JobQueue',
				function($scope, $http, $timeout, $q, $compile, $rootScope,
					nbUtil, nbMultiSelect, nbUser, nbInode, nbUploadSrv, JobQueue) {
					$scope.human_size = $rootScope.human_size;
					$scope.nbUtil = nbUtil;
					$scope.nbUser = nbUser;
					$scope.nbInode = nbInode;
					$scope.nbUploadSrv = nbUploadSrv;

					$scope.go_up_level = go_up_level;
					$scope.has_parent = has_parent;
					$scope.folder_icon = folder_icon;
					$scope.is_selection_leader = is_selection_leader;
					$scope.num_selected = num_selected;
					$scope.open_inode = open_inode;
					$scope.toggle_preview = toggle_preview;
					$scope.rename_inode = rename_inode;
					$scope.delete_inodes = delete_inodes;
					$scope.new_folder = new_folder;
					$scope.move_inodes = move_inodes;
					$scope.copy_inode = copy_inode;
					$scope.share_inode = share_inode;

					var selection = $scope.context.selection;

					$scope.select_inode = function(inode, $index, $event) {
						nbMultiSelect.select_item(selection, inode, $index, $event);
					};

					// console.log('BROWSER CONTEXT', $scope.context);
					set_current_inode($scope.context.current_inode);
					open_inode($scope.current_inode, 0, {});

					nbUploadSrv.notify_create_in_dir = function(dir_id) {
						if ($scope.current_inode.id === dir_id) {
							open_inode($scope.current_inode);
						}
					};

					function set_current_inode(dir_inode) {
						$scope.context.current_inode = dir_inode;
						$scope.current_inode = dir_inode;
						$scope.search_in_folder = '';
					}

					function go_up_level() {
						if ($scope.current_inode.level > 0) {
							open_inode($scope.current_inode.parent);
						}
					}

					function has_parent(dir_inode) {
						return dir_inode.level > 0;
					}

					function folder_icon(dir_inode) {
						return dir_inode.level > 0 ? 'fa-folder' : 'fa-folder-open'; // TODO PICK BETTER
					}

					function is_selection_leader(inode) {
						return selection.items[selection.items.length - 1] === inode;
					}

					function num_selected() {
						return selection.items.length;
					}

					function stop_event(event) {
						if (event.stopPropagation) {
							event.stopPropagation();
						}
						return false;
					}

					function open_inode(inode, $index, $event) {
						if (inode.isdir) {
							nbMultiSelect.reset_selection(selection);
							set_current_inode(inode);
							nbInode.read_dir(inode);
						} else {
							if ((inode.is_selected && !inode.is_previewing) ||
								nbMultiSelect.select_item(selection, inode, $index, $event)) {
								inode.is_previewing = true;
							} else {
								inode.is_previewing = false;
							}
							return stop_event($event);
						}
					}

					function refresh_current() {
						if ($scope.current_inode.isdir) {
							nbMultiSelect.reset_selection(selection);
							set_current_inode($scope.current_inode);
							return nbInode.read_dir($scope.current_inode);
						}
					}

					function toggle_preview(inode) {
						inode.is_previewing = !inode.is_previewing;
					}

					function rename_inode(inode) {
						if (!inode) {
							console.error('no selected inode, bailing');
							return;
						}
						if (nbInode.is_immutable_root(inode)) {
							$.nbalert('Cannot rename root folder');
							return;
						}
						if (nbInode.is_not_mine(inode)) {
							$.nbalert('Cannot rename someone else\'s file');
							return;
						}

						var dlg = $('#rename_dialog').clone();
						var input = dlg.find('#dialog_input');
						input.val(inode.name);
						dlg.find('.inode_label').html(inode.name /*make_inode_with_icon()*/ );
						dlg.find('#dialog_ok').off('click').on('click', function() {
							dlg.nbdialog('close');
							if (!input.val() || input.val() === inode.name) {
								return;
							}
							return $http({
								method: 'PUT',
								url: '/api/inode/' + inode.id,
								data: {
									parent: inode.parent.id,
									name: input.val()
								}
							}).then(function(res) {
								nbInode.read_dir(inode.parent);
								return res;
							}, function(err) {
								nbInode.read_dir(inode.parent);
								throw err;
							});
						});
						dlg.nbdialog('open', {
							remove_on_close: true,
							modal: true
						});
					}

					function new_folder(dir_inode) {
						if (!dir_inode) {
							console.error('no selected dir, bailing');
							return;
						}
						// check dir creation conditions
						// the first condition is true when looking at a directory 
						// which is not owned by the user.
						// the second is true for ghosts or when not owned by the user
						if (nbInode.is_not_mine(dir_inode) || dir_inode.owner_name) {
							$.nbalert('Cannot create folder in someone else\'s folder');
							return;
						}
						var dlg = $('#mkdir_dialog').clone();
						var input = dlg.find('#dialog_input');
						input.val('');
						dlg.find('.inode_label').html(dir_inode.name /*make_inode_with_icon()*/ );
						dlg.find('#dialog_ok').off('click').on('click', function() {
							dlg.nbdialog('close');
							if (!input.val()) {
								return;
							}
							return $http({
								method: 'POST',
								url: '/api/inode/',
								data: {
									id: dir_inode.id,
									name: input.val(),
									isdir: true
								}
							}).then(function(res) {
								nbInode.read_dir(dir_inode);
								return res;
							}, function(err) {
								nbInode.read_dir(dir_inode);
								throw err;
							});
						});
						dlg.nbdialog('open', {
							remove_on_close: true,
							modal: true
						});
					}

					function delete_inodes() {
						var selected = nbMultiSelect.selection_items(selection); // copy array
						var read_dir_promises = new Array(selected.length);
						for (var i = 0; i < selected.length; i++) {
							var inode = selected[i];
							if (!inode) {
								console.error('no selected inode, bailing');
								return;
							}
							if (nbInode.is_immutable_root(inode)) {
								$.nbalert('Cannot delete root folder');
								return;
							}
							if (nbInode.is_not_mine(inode)) {
								$.nbalert('Cannot delete someone else\'s file ' + inode.name);
								return;
							}
							read_dir_promises[i] = inode.isdir ? nbInode.read_dir(inode) : $q.when(null);
						}
						$q.all(read_dir_promises).then(function(read_dir_results) {
							var all_empty = _.reduce(read_dir_results, function(memo, res) {
								return memo && (!res || res.data.entries.length === 0);
							}, true);
							read_dir_results = null;
							var dlg = $('#delete_dialog').clone();
							if (!all_empty) {
								//modify the display message in the dialog
								dlg.find('#not_empty_msg').css('display', 'block');
								dlg.find('#normal_msg').css('display', 'none');
							}
							var del_scope = $scope.$new();
							del_scope.count = 0;
							// TODO
							// dlg.find('.inode_label').html(inode.make_inode_with_icon());
							dlg.find('#dialog_ok').off('click').on('click', function() {
								dlg.find('button.nbdialog_close').text('Hide');
								dlg.find('a.nbdialog_close').attr('title', 'Hide');
								dlg.find('#dialog_ok')
									.addClass('disabled')
									.empty()
									.append($('<i class="fa fa-spinner fa-spin fa-lg fa-fw"></i>'))
									.append($compile('<span style="padding-left: 20px">Deleted {{count}}</span>')(del_scope));
								del_scope.$digest();
								nbInode.recursive_delete(selection.items, del_scope, function() {
									nbInode.read_dir($scope.current_inode);
									dlg.nbdialog('close');
									del_scope.$destroy();
								});
							});
							dlg.nbdialog('open', {
								remove_on_close: true,
								modal: true
							});
						}, function(err) {
							console.error('FAILED TO CHECK DIR EMPTY', err);
							throw err;
						});
					}

					function move_inodes() {
						var modal;
						var selected = nbMultiSelect.selection_items(selection);
						if (!selected.length) {
							return;
						}
						if (!nbInode.can_change_inode(selected[0])) {
							$.nbalert('Cannot move item');
						}
						var mv_scope = $scope.$new();
						mv_scope.count = 0;
						mv_scope.context = {
							current_inode: $scope.current_inode,
							dir_only: true
						};
						mv_scope.run_disabled = function() {
							return mv_scope.running || !nbInode.can_move_to_dir(mv_scope.context.current_inode);
						};
						mv_scope.run = function() {
							console.log('RUN', selected);
							mv_scope.running = true;
							var promises = new Array(selected.length);
							for (var i = 0; i < selected.length; i++) {
								promises[i] = nbInode.move_inode(selected[i], mv_scope.context.current_inode);
							}
							$q.all(promises).then(function() {
								modal.modal('hide');
								refresh_current();
							});
						};
						var hdr = $('<div class="modal-header">')
							.append($('<button type="button" class="close" data-dismiss="modal" aria-hidden="true">').html('&times;'))
							.append($('<h4>').text('Move to ...'));
						var body = $('<div class="modal-body" nb-chooser context="context">').css('padding', 0);
						var foot = $('<div class="modal-footer">').css('margin-top', 0)
							.append($('<button type="button" class="btn btn-default" data-dismiss="modal">').text('Close'))
							.append($('<button type="button" class="btn btn-primary" ng-click="run()" ng-disabled="run_disabled()">').text('OK'));
						modal = nbUtil.modal(hdr, body, foot, mv_scope);
					}

					function copy_inode(inode) {
						return nbInode.copy_inode(inode).then(refresh_current, refresh_current);
					}

					function share_inode(inode) {
						return nbInode.share_inode(inode, refresh_current);
					}
				}
			]
		};
	});




	/////////////////////
	// MEDIA DIRECTIVE //
	/////////////////////


	noobaa_app.directive('nbMedia', ['$parse', '$timeout', 'nbInode', 'nbPlanet',
		function($parse, $timeout, nbInode, nbPlanet) {
			return {
				replace: true,
				link: function(scope, element, attr) {
					scope.nbInode = nbInode;
					scope.$watch(attr.nbMedia, function(value) {
						scope.inode = scope.$eval(attr.nbMedia) || {};
					});
					scope.media_events = scope.$eval(attr.mediaEvents) || {};
					scope.is_previewing = scope.$eval(attr.showContent);
					scope.toggle_content = function() {
						if (nbPlanet.on) {
							if (nbPlanet.open_content(scope.inode)) {
								return;
							}
						}
						scope.show_content = !scope.show_content;
						// TODO a little bit hacky way to call notify_layout...
						if (scope.media_events.load) {
							scope.media_events.load();
						}
					};
					if (scope.is_previewing) {
						scope.toggle_content();
					}
				},
				templateUrl: '/public/html/media_template.html'
			};
		}
	]);

	///////////////////////
	// CHOOSER DIRECTIVE //
	///////////////////////


	noobaa_app.directive('nbChooser', ['$parse', '$timeout', 'nbInode',
		function($parse, $timeout, nbInode) {
			return {
				replace: true,
				templateUrl: '/public/html/chooser_template.html',
				scope: { // isolated scope
					context: '='
				},
				controller: [
					'$scope', '$http', '$timeout', '$q', '$compile', '$rootScope', 'nbUtil', 'nbInode',
					function($scope, $http, $timeout, $q, $compile, $rootScope, nbUtil, nbInode) {
						$scope.human_size = $rootScope.human_size;
						$scope.nbUtil = nbUtil;
						$scope.nbInode = nbInode;

						set_current_inode($scope.context.current_inode);

						function set_current_inode(inode) {
							$scope.context.current_inode = inode;
							$scope.current_inode = inode;
						}

						$scope.open_inode = function(inode) {
							set_current_inode(inode);
							if (inode.isdir) {
								nbInode.read_dir(inode);
							}
						};

						$scope.has_parent = function(inode) {
							return inode.level > 0;
						};

						$scope.go_up_level = function() {
							if ($scope.current_inode.level > 0) {
								set_current_inode($scope.current_inode.parent);
							}
						};
					}
				]
			};
		}
	]);


	/////////////////////
	// SHARE DIRECTIVE //
	/////////////////////


	noobaa_app.controller('ShareModalCtrl', ['$scope', '$http',
		function($scope, $http) {
			var dlg = $('#share_modal');


			$scope.open = function(inode) {
				// TODO FIX ICON
				dlg.find('.inode_label').html(inode.name /*make_inode_with_icon()*/ );
				$scope.share_is_loading = true;
				$scope.share_inode = inode;
				get_share_list(inode).then(function(res) {
					$scope.share_is_loading = false;
					$scope.share_list = res.data.list;
				}, function() {
					$scope.share_is_loading = false;
				});
				dlg.nbdialog('open', {
					modal: true,
					css: {
						height: "80%",
						width: 350
					}
				});
			};

			$scope.submit = function() {
				var inode = $scope.share_inode;
				var share_list = $scope.share_list;
				$scope.share_is_loading = true;
				set_share_list(inode, share_list).then(function(res) {
					$scope.share_is_loading = false;
					$('#share_modal').nbdialog('close');
					// TODO NEED TO READDIR AFTER SHARE?
					// if (inode.parent) {
					// 	inode.parent.read_dir();
					// }
				}, function() {
					$scope.share_is_loading = false;
				});
			};

			$scope.mklink = function() {
				var inode = $scope.share_inode;
				$scope.share_is_loading = true;
				mklink(inode).then(function(res) {
					$scope.share_is_loading = false;
					$('#share_modal').nbdialog('close');
					console.log('mklink', res.data);
					var dlg = $('#getlink_dialog').clone();
					// TODO FIX ICON
					dlg.find('.inode_label').html(inode.name /*make_inode_with_icon()*/ );
					dlg.find('.link_label').html(
						'<div style="height: 100%; word-wrap: break-word; word-break: break-all">' +
						window.location.host + res.data.url + '</div>');
					dlg.nbdialog('open', {
						remove_on_close: true,
						modal: false,
						css: {
							width: 300,
							height: 400
						}
					});
				}, function() {
					$scope.share_is_loading = false;
				});
			};

			$scope.rmlinks = function() {
				var inode = $scope.share_inode;
				$scope.share_is_loading = true;
				rmlinks(inode).then(function(res) {
					$scope.share_is_loading = false;
					$('#share_modal').nbdialog('close');
					console.log('rmlinks', res.data);
					$.nbalert('Revoked!');
				}, function() {
					$scope.share_is_loading = false;
				});
			};

		}
	]);
})();
