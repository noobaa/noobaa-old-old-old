/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbInode', [
		'$http', '$timeout', '$interval', '$q', '$window', '$location', '$rootScope', 'JobQueue', 'nbUtil', 'nbUser',
		function($http, $timeout, $interval, $q, $window, $location, $rootScope, JobQueue, nbUtil, nbUser) {

			var $scope = {
				inode_api_url: inode_api_url,
				seamless_open_inode: seamless_open_inode,
				download_inode: download_inode,
				is_immutable_root: is_immutable_root,
				is_shared_with_me: is_shared_with_me,
				is_not_mine: is_not_mine,
				can_upload_to_dir: can_upload_to_dir,
				can_upload_file: can_upload_file,
				can_share_inode: can_share_inode,
				can_keep_inode: can_keep_inode,
				can_change_inode: can_change_inode,
				can_move_to_dir: can_move_to_dir,
				init_root_dir: init_root_dir,
				read_all: read_all,
				read_dir: read_dir,
				is_dir_non_empty: is_dir_non_empty,
				parents_path: parents_path,
				recursive_delete: recursive_delete,
				recursive_copy: recursive_copy,
				copy_inode: copy_inode,
				move_inode: move_inode,
				get_share_list: get_share_list,
				set_share_list: set_share_list,
				mklink: mklink,
				rmlinks: rmlinks,
				share_inode: share_inode,
				keep_inode: keep_inode,
				keep_and_share_all: keep_and_share_all,
			};

			function inode_api_url(inode_id) {
				return '/api/inode/' + inode_id;
			}

			function inode_call(method, inode_id) {
				return {
					method: method,
					url: '/api/inode/' + inode_id
				};
			}

			function seamless_open_inode(inode) {
				var url = inode_api_url(inode.id) + '?seamless=1';
				var win = window.open(url, '_blank');
				win.focus();
			}

			function download_inode(inode) {
				var url = inode_api_url(inode) + '?is_download=true';
				$('<iframe style="display: none">')[0].src = url;
				// var win = window.open(url, '_blank');
				// win.focus();
			}

			// return true for "My Data" and "Shared With Me"
			// which are user root dirs and shouldn't be modified.

			function is_immutable_root(inode) {
				return !inode.parent || !inode.parent.parent;
			}

			function is_shared_with_me(inode) {
				return inode.swm;
			}

			function is_not_mine(inode) {
				return inode.not_mine;
			}

			function can_upload_to_dir(inode) {
				return inode && inode.isdir && !inode.swm && inode.level > 0;
			}

			function can_upload_file(inode) {
				return inode && can_upload_to_dir(inode.parent) && !inode.isdir && inode.uploading;
			}

			function can_share_inode(inode) {
				return inode && !inode.swm && inode.level > 1;
			}

			function can_keep_inode(inode) {
				return inode && inode.swm && inode.level > 1;
			}

			function can_change_inode(inode) {
				return inode && !inode.not_mine && inode.level > 1;
			}

			function can_move_to_dir(inode) {
				return inode && !inode.not_mine && !inode.owner && inode.level > 0;
			}

			function init_root_dir() {
				return {
					id: null,
					parent: null,
					level: 0,
					isdir: true,
					name: 'My Items',
					entries: [],
					entries_map: {}
				};
			}

			var CONTENT_KINDS = {
				'image': 'image',
				'video': 'video',
				'audio': 'audio',
				'text': 'text',
			};

			function read_all(root_dir) {
				root_dir.is_loading = true;
				return $http({
					method: 'GET',
					url: '/api/inode/'
				}).then(function(res) {
					root_dir.is_loading = false;
					var entries = res.data.entries;
					var inodes_map = _.groupBy(entries, 'id');
					var parents_map = _.groupBy(entries, 'parent_id');

					function set_dir_entries(dir_inode) {
						var ents = parents_map[dir_inode.id || null] || [];
						ents.sort(dir_inode.sorting_func || function(a, b) {
							return a.isdir ? -1 : 1;
						});
						dir_inode.entries = ents;
						dir_inode.entries_map = _.groupBy(ents, 'id');
						console.log('SET READ ALL ENTRIES', dir_inode, ents);
						for (var i = 0; i < ents.length; i++) {
							ents[i].parent = dir_inode;
							ents[i].level = dir_inode.level + 1;
						}
					}
					set_dir_entries(root_dir);
					root_dir.inodes_map = root_dir.inodes_map || {};
					for (var i = 0; i < entries.length; i++) {
						var e = root_dir.inodes_map[entries[i].id];
						if (!e) {
							e = entries[i];
						} else {
							angular.extend(e, entries[i]);
						}
						if (e.isdir) {
							e.content_kind = 'dir';
						} else if (e.content_type) {
							e.content_kind = CONTENT_KINDS[e.content_type.split('/')[0]] || e.content_type;
						}
						if (e.ctime) {
							e.ctime_date = new Date(e.ctime);
							e.ctime_display = e.ctime_date.toLocaleDateString();
						}
						if (e.isdir) {
							set_dir_entries(e);
						}
					}
					root_dir.inodes_map = inodes_map;
					return res;
				}, function(err) {
					root_dir.is_loading = false;
					console.error('FAILED READ ALL', err);
					throw err;
				});
			}

			function read_dir(dir_inode) {
				console.log('READDIR', dir_inode.name);
				dir_inode.is_loading = true;
				return $http(inode_call('GET', dir_inode.id)).then(function(res) {
					dir_inode.is_loading = false;
					console.log('READDIR OK', dir_inode.name);
					var entries = res.data.entries;
					dir_inode.entries = entries;
					dir_inode.entries_map = dir_inode.entries_map || {};
					var entries_map = {};
					var entries_by_kind = {
						video: [],
						audio: [],
						image: []
					};
					for (var i = 0; i < entries.length; i++) {
						var e = dir_inode.entries_map[entries[i].id];
						if (!e) {
							e = entries[i];
						} else {
							angular.extend(e, entries[i]);
							// turn off the uploading flag because we don't send each time
							// and extend won't turn off when the key is missing
							if (e.uploading && !entries[i].uploading) {
								delete e.uploading;
							}
						}
						var kind;
						if (e.isdir) {
							e.content_kind = kind = 'dir';
						} else if (e.content_type) {
							kind = CONTENT_KINDS[e.content_type.split('/')[0]];
							e.content_kind = kind || e.content_type;
						}
						if (kind && entries_by_kind[kind]) {
							entries_by_kind[kind].push(e);
						}
						if (e.ctime) {
							e.ctime_date = new Date(e.ctime);
							e.ctime_display = e.ctime_date.toLocaleDateString();
						}
						if (dir_inode.swm) {
							e.swm = dir_inode.swm;
						}
						e.parent = dir_inode;
						e.level = dir_inode.level + 1;
						entries[i] = e;
						entries_map[e.id] = e;
					}
					entries.sort(dir_inode.sorting_func || function(a, b) {
						return a.isdir ? -1 : 1;
					});
					dir_inode.entries_map = entries_map;
					dir_inode.entries_by_kind = entries_by_kind;
					return res;
				}, function(err) {
					dir_inode.is_loading = false;
					console.error('FAILED READDIR', err);
					return $timeout(function() {
						read_dir(dir_inode);
					}, 3000);
				});
			}


			function is_dir_non_empty(inode, callback) {
				if (!inode.isdir) {
					callback(false);
					return;
				}
				var promise = read_dir(inode);
				if (!promise) {
					callback( !! inode.entries.length);
				} else {
					promise.then(function(res) {
						callback( !! inode.entries.length);
						return res;
					}, function(err) {
						callback( !! inode.entries.length);
						throw err;
					});
				}
			}

			function parents_path(inode) {
				if (!inode) {
					return;
				}
				var parents = new Array(inode.level);
				var p = inode.parent;
				for (var i = inode.level - 1; i >= 0; i--) {
					parents[i] = p;
					p = p.parent;
				}
				return parents;
			}

			function recursive_delete(inodes, del_scope, complete) {
				var jobq = new JobQueue($timeout, 32);
				var do_delete = function(inode_id, ctx) {
					if (!inode_id) {
						ctx.complete();
						return;
					}
					return $http({
						method: 'DELETE',
						url: '/api/inode/' + inode_id
					})['finally'](function() {
						del_scope.count++;
						ctx.count--;
						if (ctx.count === 0) {
							jobq.add({
								run: do_delete.bind(null, ctx.inode_id, ctx.parent || ctx)
							});
						}
					});
				};
				var add_recurse_job = function(inode, ctx) {
					jobq.add({
						run: delete_recurse.bind(null, {
							entries: inode.entries,
							count: inode.entries.length,
							inode_id: inode.id,
							parent: ctx
						})
					});
				};
				var delete_recurse = function(ctx) {
					if (!ctx.entries.length) {
						do_delete(ctx.inode_id, ctx.parent || ctx);
					}
					for (var i = 0; i < ctx.entries.length; i++) {
						var inode = ctx.entries[i];
						if (inode.isdir && !ctx.skip_read_dir) {
							read_dir(inode).then(
								add_recurse_job.bind(null, inode, ctx),
								do_delete.bind(null, inode.id, ctx));
						} else if (inode.isdir && inode.entries.length) {
							add_recurse_job(inode, ctx);
						} else {
							jobq.add({
								run: do_delete.bind(null, inode.id, ctx)
							});
						}
					}
				};
				delete_recurse({
					entries: inodes,
					count: inodes.length,
					skip_read_dir: true,
					complete: complete
				});
			}

			function single_copy(inode, new_parent_id, new_name) {
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode.id + '/copy',
					data: {
						new_parent_id: new_parent_id,
						new_name: new_name,
					}
				});
			}

			function recurse_dir_copy(dir_inode, new_dir_id, copy_scope) {
				copy_scope.concurrency++;
				return read_dir(dir_inode).then(function() {
					copy_scope.concurrency--;
					var sons = dir_inode.entries.slice(0); // copy array
					var copy_sons = function() {
						if (!sons || !sons.length) {
							return $q.when();
						}
						var promises = [];
						while (copy_scope.concurrency < copy_scope.max_concurrency && sons.length) {
							promises.push(recursive_copy(sons.pop(), copy_scope, new_dir_id, null).then(copy_sons));
						}
						return $q.all(promises);
					};
					return copy_sons();
				}, function(err) {
					copy_scope.concurrency--;
					console.error('FAILED DIR COPY', dir_inode, err);
					throw err;
				});
			}

			function recursive_copy(inode, copy_scope, new_parent_id, new_name) {
				copy_scope.concurrency++;
				return single_copy(inode, new_parent_id, new_name).then(function(res) {
					copy_scope.concurrency--;
					copy_scope.count++;
					var new_inode_id = res.data.id;
					if (inode.isdir) {
						return recurse_dir_copy(inode, new_inode_id, copy_scope);
					}
				}, function(err) {
					copy_scope.concurrency--;
					console.error('FAILED RECURSE COPY', inode, err);
					throw err;
				});
			}

			function copy_inode(inode, on_top_copy) {
				if (!inode) {
					console.error('no selected inode, bailing');
					return;
				}
				if (is_immutable_root(inode)) {
					$.nbalert('Cannot copy root folder');
					return;
				}

				var copy_scope = $rootScope.$new();
				copy_scope.count = 0;
				copy_scope.concurrency = 0;
				copy_scope.max_concurrency = 32;

				var new_inode_id;
				return single_copy(inode).then(function(res) {
					copy_scope.count++;
					new_inode_id = res.data.id;
					if (on_top_copy) {
						return on_top_copy(new_inode_id);
					}
				}).then(function() {
					if (inode.isdir) {
						return recurse_dir_copy(inode, new_inode_id, copy_scope);
					}
				}).then(null, function(err) {
					console.error('FAILED COPY', inode, err);
					throw err;
				});
			}

			function move_inode(inode, dir_inode) {
				console.log('MOVE', inode.name, dir_inode.name);
				if (!can_change_inode(inode)) {
					$.nbalert('Cannot move item');
					return;
				}
				if (!can_move_to_dir(dir_inode)) {
					$.nbalert('Cannot move into someone else\'s folder');
					return;
				}
				if (is_shared_with_me(inode) !== is_shared_with_me(dir_inode)) {
					$.nbalert('Cannot move in or out of the "Shared With Me" folder.<br/>' +
						'Maybe you meant to use "Add To My Data"...');
					return;
				}
				var p = dir_inode;
				while (p) {
					if (p.id === inode.id) {
						$.nbalert('Cannot create circular folders.<br/>It\'s just wrong...');
						return;
					}
					p = p.parent;
				}
				if (inode.parent.id === dir_inode.id) {
					console.log('move into same parent. nothing to do.');
					return;
				}
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode.id,
					data: {
						parent: dir_inode.id,
					}
				});
			}


			function get_share_list(inode_id) {
				console.log('get_share_list', inode_id);
				return $http({
					method: 'GET',
					url: '/api/inode/' + inode_id + '/share_list'
				});
			}

			function set_share_list(inode_id, share_list) {
				console.log('share', inode_id, 'with', share_list);
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode_id + '/share_list',
					data: {
						share_list: share_list
					}
				});
			}

			function mklink(inode, link_options) {
				console.log('mklink', inode, link_options);
				return $http({
					method: 'POST',
					url: '/api/inode/' + inode.id + '/link',
					data: {
						link_options: link_options
					}
				});
			}

			function rmlinks(inode) {
				console.log('revoke_links', inode);
				return $http({
					method: 'DELETE',
					url: '/api/inode/' + inode.id + '/link'
				});
			}

			function mark_all_share_list(share_list, value) {
				for (var i = 0; i < share_list.length; i++) {
					share_list[i].shared = value;
				}
			}

			function share_inode(inode, on_share_done) {
				if (!inode) {
					console.error('no selected inode, bailing');
					return;
				}
				if (is_immutable_root(inode)) {
					$.nbalert('Cannot share root folder');
					return;
				}
				if (is_shared_with_me(inode)) {
					$.nbalert('Cannot share files not in My Data. Use "Add to My Data" first');
					return;
				}
				if (is_not_mine(inode)) {
					$.nbalert('Cannot share someone else\'s file');
					return;
				}

				var modal;
				var share_scope = $rootScope.$new();
				share_scope.nbUtil = nbUtil;
				share_scope.nbUser = nbUser;
				share_scope.share_is_loading = true;
				share_scope.share_inode = inode;
				share_scope.run = function() {
					share_scope.share_is_loading = true;
					set_share_list(inode.id, share_scope.share_list).then(function(res) {
						share_scope.share_is_loading = false;
						modal.modal('hide');
						if (on_share_done) {
							on_share_done();
						}
					}, function() {
						share_scope.share_is_loading = false;
					});
				};
				share_scope.mark_all = function(value) {
					mark_all_share_list(share_scope.share_list, value);
				};
				var hdr = $('<div class="modal-header">')
					.append($('<button type="button" class="close" data-dismiss="modal" aria-hidden="true">').html('&times;'))
					.append($('<h4>').text('Share ' + inode.name));
				var body = $('<div class="modal-body">').css('padding', 0).append($('#share_modal').html());
				var foot = $('<div class="modal-footer">').css('margin-top', 0)
					.append($('<button type="button" class="btn btn-default" data-dismiss="modal">').text('Cancel'))
					.append($('<button type="button" class="btn btn-primary" ' +
						'ng-click="run()" ng-disabled="share_is_loading || !share_list.length">').text('Share'));
				modal = nbUtil.modal(hdr, body, foot, share_scope);
				get_share_list(inode.id).then(function(res) {
					share_scope.share_is_loading = false;
					share_scope.share_list = res.data.list;
					if (!share_scope.share_list.length) {
						modal.modal('hide');
						modal = null;
						$location.path('/friends/');
					}
				}, function() {
					share_scope.share_is_loading = false;
				});
			}

			function keep_inode(inode) {
				return copy_inode(inode).then(function(res) {
					var notify_message = '"' + inode.name + '" was added to My-Data';
					// if (copy_scope.count !== 1) {
						// notify_message += ' (' + copy_scope.count + ' items)';
					// }
					$.bootstrapGrowl(notify_message, {
						ele: 'body',
						type: 'info',
						offset: {
							from: 'top',
							amount: 60
						},
						align: 'right',
						width: 'auto',
						delay: 5000,
						allow_dismiss: true,
						stackup_spacing: 20
					});
					return res;
				});
			}

			function keep_and_share_all(inode) {
				return copy_inode(inode, function(new_inode_id) {
					// run this immediately after top inode is copied
					var share_list;
					return get_share_list(new_inode_id).then(function(res) {
						share_list = res.data.list;
						mark_all_share_list(share_list, true);
						return set_share_list(new_inode_id, share_list);
					}).then(function() {
						var notify_message = '"' + inode.name + '" was shared to ' +
							share_list.length + (share_list.length === 1 ? ' friend' : ' friends');
						$.bootstrapGrowl(notify_message, {
							ele: 'body',
							type: 'info',
							offset: {
								from: 'top',
								amount: 60
							},
							align: 'right',
							width: 'auto',
							delay: 5000,
							allow_dismiss: true,
							stackup_spacing: 20
						});
					}, function(err) {
						console.error('FAILED SHARE ALL', err);
						throw err;
					});
				});
			}

			return $scope;

		}
	]);

})();
