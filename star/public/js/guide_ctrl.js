/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */

// TODO: any better way than making so global? we need them at body scope...
var global_menu_bar_first_guide;
var global_menu_bar_last_guide;

(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');


	////////////////////////////////
	////////////////////////////////
	// GuideCtrl
	////////////////////////////////
	////////////////////////////////

	noobaa_app.controller('GuideCtrl', [
		'$scope',
		GuideCtrl
	]);

	function GuideCtrl($scope) {

		function guide_template(i, step) {
			var fin = (i + 1) === step.guide.steps.length;
			return [
				'<div class="popover tour">',
				'  <div class="arrow"></div>',
				'  <div class="popover-title fntmd"></div>',
				'  <div class="popover-content fntmd"></div>',
				'  <div class="popover-navigation text-center">',
				'    <span class="pull-left">',
				'      <span>', (i + 1), '/', step.guide.steps.length, '</span>',
				'    </span>',
				'    <span class="pull-right">',
				'      <button data-role="first" class="btn btn-default btn-xs"',
				'        onclick="global_menu_bar_first_guide()">',
				'        <i class="icon-repeat"></i></button>',
				'      <button data-role="end" class="btn btn-default btn-xs">',
				'        <i class="icon-remove"></i></button>',
				'    </span>',
				'    <span>',
				'      <button data-role="prev" class="btn btn-default btn-xs">Prev</button>',
				fin ?
				'      <button data-role="end" class="btn btn-info btn-xs">Done</button>' :
				'      <button data-role="next" class="btn btn-primary btn-xs">Next</button>',
				'    </span>',
				'  </div>',
				'</div>'
			].join('\n');
		}

		function Guide(name, title) {
			var me = this;
			// name is used to identify this tour in the local storage,
			// so when modified it will suddenly popup for users.
			this.name = name;
			// the title property is used by us when presenting the list of guides
			this.title = title;
			this.steps = [];
			this.completed_steps = parseInt(localStorage[name + '_completed_steps'], 10) || 0;
			this.was_started = localStorage[name + '_was_started'] === 'true';
			this.tour = new Tour({
				name: name,
				debug: true,
				path: '/mydata',
				backdrop: true,
				orphan: true,
				template: guide_template,
				onStart: function() {
					if (!me.was_started) {
						me.was_started = true;
						localStorage[name + '_was_started'] = 'true';
					}
					if ($scope.running_guide) {
						$scope.running_guide.tour.end();
					}
					$scope.running_guide = me;
					$scope.safe_apply();
				},
				onEnd: function() {
					if (me.tour._current >= me.completed_steps ||
						me.tour._current + 1 >= me.steps.length) {
						// mark persistent completion when new step is reached
						me.completed_steps = me.tour._current + 1;
						localStorage[name + '_completed_steps'] = me.completed_steps;
					}
					$scope.running_guide = null;
					$scope.safe_apply();
				}
			});
		}

		// called after the steps array is full and ready.
		// it should remain unchanged once it is called.
		Guide.prototype.steps_ready = function(auto_start) {
			var me = this;
			_.each(this.steps, function(step) {
				// link backwards. helpfull in the template function
				step.guide = me;
			});
			// add the steps array to the tour.
			this.tour.addSteps(this.steps);
			// handle redirections here - need to start the tour which did redirect
			// so we identify simply by the first that's not ended.
			// console.log(this);
			if (!this.tour.ended() && !$scope.running_guide) {
				if (this.was_started || auto_start) {
					this.run();
				}
			}
		};

		Guide.prototype.is_completed = function() {
			// TODO: for now just check for tour end, but this is where we want 
			// to check for more complex conditions - such as did the user really share, etc
			return this.completed_steps === this.steps.length;
		};

		// since we update the number of steps in the tour
		// we need to make sure that current step is valid
		// otherwise even goto() will fail (onHide on undefined step).
		Guide.prototype.valid_step = function() {
			var i = this.tour._current;
			if (typeof i !== 'number' || i < 0 || i >= this.steps.length) {
				console.log('resetting invalid tour step', i, this.name);
				i = this.tour._current = 0;
			}
			return i;
		};

		Guide.prototype.run = function() {
			// we want to implement "pause" so we keep
			// and restore the step number, otherwise restart will clear it.
			var i = this.valid_step();
			if (this.tour.ended()) {
				// when the tour ended, only restart can redeem it
				this.tour.restart();
			} else {
				this.tour.start();
			}
			this.tour.goto(i);
		};

		global_menu_bar_first_guide = function() {
			if ($scope.running_guide && !$scope.running_guide.tour.ended()) {
				$scope.running_guide.valid_step();
				$scope.running_guide.tour.goto(0);
			}
			$scope.safe_apply();
		};
		global_menu_bar_last_guide = function() {
			if ($scope.running_guide && !$scope.running_guide.tour.ended()) {
				$scope.running_guide.valid_step();
				$scope.running_guide.tour.goto($scope.running_guide.steps.length - 1);
			}
			$scope.safe_apply();
		};

		// define guides in order
		$scope.guides_list = [
			new Guide('welcome', 'Welcome'),
			new Guide('upload_file', 'Uploading'),
			new Guide('access_file', 'Accessing'),
			new Guide('share_file', 'Sharing'),
			new Guide('shared_with_me', 'Shared with me'),
			new Guide('cosharing', 'Co-Sharing')
		];

		// also create map by name for easier access
		$scope.guides = {};
		_.each($scope.guides_list, function(guide) {
			$scope.guides[guide.name] = guide;
		});
		// make available to all scopes
		$scope.$root.nbguides = $scope.guides;



		//// WELCOME ////

		$scope.guides.welcome.steps.push({
			title: 'WELCOME TO NOOBAA',
			content: [
				'<p>Use NooBaa for <b>extreme media files!</b></p>',
				'<p>Unlike Dropbox it is <b>FREE</b> for any capacity!',
				'  The Crowd makes it so...</p>'
			].join('\n')
		});

		$scope.guides.welcome.steps.push({
			element: '#upload_button',
			placement: 'bottom',
			title: 'UPLOAD',
			content: [
				'<p>Use the upload button',
				'<a class="btn btn-sm btn-success" href="#"><i class="icon-cloud-upload icon-large"></i></a>',
				'  to upload files to your account.</p>',
				'<p>They will remain private until you share them.</p>',
			].join('\n')
		});

		$scope.guides.welcome.steps.push({
			element: '#space_button',
			placement: 'bottom',
			title: 'ADD SPACE',
			content: [
				'<p>Add space to your account using the NooBaa client available with this button',
				' <a class="btn btn-sm btn-danger"><i class="icon-rocket icon-large"></i></a> .</p>',
				'<p>Install the client to add space by co-sharing, and for improved uploads.</p>',
			].join('\n')
		});

		$scope.guides.welcome.steps.push({
			title: 'WHAT\'S NEXT',
			content: [
				// '<p>You have taken the first step in the way of the NooBaa!</p>',
				'<p>When you are ready to master <b>Sharing</b> and <b>Co-Sharing</b>, ',
				'  check out the guide button ',
				'  <i class="icon-info-sign text-info"></i></p>',
				'<p>Use the feedback button <i class="icon-comments text-info"></i>',
				'  frequently, it is very rewarding.</p>',
				// '<p>Have a good one!</p>',
				'<p class="text-right">- The NooBaa Team -</p>'
			].join('\n')
		});
		$scope.guides.welcome.steps_ready(true);



		//// UPLOAD FILE ////

		$scope.guides.upload_file.steps.push({
			element: '#upload_button',
			placement: 'bottom',
			title: 'UPLOAD\'S WINDOW',
			content: [
				'<p>The upload button ',
				'<a class="btn btn-sm btn-success"><i class="icon-cloud-upload icon-large"></i></a>',
				' shows or hides the upload\'s window.',
				'<p>In the upload\'s window use the <a class="btn btn-sm btn-success">Choose Files</a>',
				' button to start uploading.</p>'
			].join('\n'),
			onShow: function() {
				$scope.$root.$broadcast('show_uploads_view');
			}
		});

		$scope.guides.upload_file.steps.push({
			title: 'DRAG & DROP',
			content: [
				'<p>Drag a file and drop it <b>anywhere</b> in the NooBaa window.</p>',
				'<p>This will immediately start uploading and the uploads window will open to show the progress.</p>',
			].join('\n')
		});


		$scope.guides.upload_file.steps.push({
			element: '#space_button',
			placement: 'bottom',
			title: 'UPLOAD ENTIRE FOLDER',
			content: [
				'<p>Entire folder upload is currently only supported by chrome browser ',
				' <a href="https://www.google.com/intl/en_us/chrome/browser/" target="_blank">',
				'  <img alt="Chrome" src="/public/images/chrome_icon.png" width=20/></a>',
				' using drag and drop. We wish more browsers will support but they don\'t yet.</p>',
				'<p>For uploading big files and folders we recommend using the NooBaa client',
				' available to download with this button',
				' <a class="btn btn-sm btn-danger"><i class="icon-rocket icon-large"></i></a>',
				' which can upload big folders, handles disconnections,',
				' allows to add space using co-sharing, and is free.</p>',
			].join('\n')
		});

		$scope.guides.upload_file.steps.push({
			element: '#inodes_tree',
			placement: 'right',
			title: 'WHERE IS IT?',
			content: [
				'<p>Upload are added to your account',
				'  into the folder that is selected when the upload starts.',
				'<p><b>But</b> you don\'t need to sit and wait for uploads to complete -',
				' you can organize them (share, move, rename, etc.) while they are still being uploaded!</p>',
			].join('\n')
		});

		$scope.guides.upload_file.steps.push({
			title: 'DONE',
			content: [
				'<p>Well done - you are a now a master of uploads!</p>',
				'<p>Check out more guides using',
				'  <i class="icon-info-sign text-info"></i></p>',
			].join('\n')
		});
		$scope.guides.upload_file.steps_ready();



		// ACCESS FILE ////

		$scope.guides.access_file.steps.push({
			title: 'ACCESSING',
			content: [
				'<p>This guide will show you how to open your files and browse your directories:</p>',
				'<ul class="nav">',
				'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>Opening a file and directory</p></li>',
				'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>The folder content area</p></li>',
				'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>The folders tree</p></li>',
				'</ul>'
			].join('\n')
		});

		$scope.guides.access_file.steps.push({
			element: '#open_button',
			placement: 'bottom',
			title: 'THE PLAY BUTTON',
			content: [
				'<p><a class="btn btn-default toolbtn" href="#"><i class="icon-play icon-large"></i></a>',
				' is used to open files and directories.</p>',
				'<ul >',
				'   <li><p>Select the file or folder and press the play button to open it.</p></li>',
				'   <li><p>When using a mouse, double-click a file or folder to open it.</p></li>',
				'</ul>',

			].join('\n')
		});

		$scope.guides.access_file.steps.push({
			element: '#inodes_list',
			placement: 'right auto',
			title: 'THE FOLDER CONTENT AREA',
			content: [
				'<p>Shows the files and folders within the currently selected folder.</p>',
				'<p>Open a file using the play button, or double click on the file\'s line. </p>',
				'<p>Drag and drop files here to upload.</p>',
				'<p>Drag and drop files from here to other folders to move them.</p>',
			].join('\n')
		});

		$scope.guides.access_file.steps.push({
			element: '#inodes_tree',
			placement: 'right auto',
			title: 'THE FOLDERS TREE',
			content: [
				'<p>	The currently selected folder is marked in the folder tree, and it\'s content is displayed in the content area.</p>',
				'<p>	Open a folder using the play button or double-click on it. </p>',
			].join('\n')
		});

		$scope.guides.access_file.steps_ready();



		//// SHARE FILE ////

		$scope.guides.share_file.steps.push({
			element: "#share_button",
			placement: 'bottom',
			title: "THE SHARING BUTTON",
			content: [
				'<p><a class="btn btn-default toolbtn" href="#"><i class="icon-share icon-large"></i></a> Allows you to share a file or folder. </p>',
				'<p> You can select whom you\'d like to share with from your social network friends.</p>',
			].join('\n ')
		});

		$scope.guides.share_file.steps.push({
			element: "#share_button",
			placement: 'bottom',
			title: "THE SHARING BUTTON",
			content: [
				'<p> In addition you can create a link. The link allows everybody who has it, to access the file. </p>',
				'<p> You can revoke the link, making the file inaccessible with that link.</p> ',
			].join('\n ')
		});

		$scope.guides.share_file.steps.push({
			element: "#share_button",
			placement: 'bottom',
			title: "THE SHARING BUTTON",
			content: [
				'<p> The <i class="icon-share icon-large"></i> indication is provided for any shared file in the folder content view, so you can always tell who can read your files.</p>',
			].join('\n ')
		});

		$scope.guides.share_file.steps.push({
			element: "#share_button",
			placement: 'bottom',
			title: "PRIVACY",
			content: [
				'<p> In NooBaa every file is private until you share it. </p>',
				'<p> Notice that sharing a folder shares all files under it, including files you\'ll add to that folder after the sharing. </p>',
			].join('\n')
		});

		$scope.guides.share_file.steps.push({
			element: "#share_button",
			placement: 'bottom',
			title: "SHARING IS FREE",
			content: [
				'<p> Sharing is free in every aspect. </p>',
				'<p> It doesn\'t cost you anything and it doesn\'t add any sort of charge or quota usage to your friends. </p>',
			].join('\n')
		});

		$scope.guides.share_file.steps_ready();



		// SHARED WITH ME //

		$scope.guides.shared_with_me.steps.push({
			element: "#inodes_tree",
			placement: 'right auto',
			title: "THE 'SHARED WITH ME' FOLDER",
			content: [
				'<p> In Noobaa there are two basic folders:</p>',
				'<ul class="nav">',
				'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>My data</p></li>',
				'  <li><p><i class="icon-compass icon-li icon-fixed-width"></i>Shared with me</p></li>',
				'</ul>'
			].join('\n')
		});

		$scope.guides.shared_with_me.steps.push({
			element: "#inodes_tree",
			placement: 'right auto',
			title: "THE 'SHARED WITH ME' FOLDER",
			content: [
				'<p> The \'Shared With Me\' folder points all to files your friends shared with you.</p>',
				'<p> Each of the files in this folder will show who shared it with you.</p>',
			].join('\n')
		});

		$scope.guides.shared_with_me.steps.push({
			element: "#inodes_tree",
			placement: 'right auto',
			title: "THE 'SHARED WITH ME' FOLDER",
			content: [
				'<p> As one can share only within your social network, spamming is not an option.</p>',
				'<p> Well... except for that friends you\'re not sure why you have on you friends list...</p>',
			].join('\n')
		});

		$scope.guides.shared_with_me.steps.push({
			element: "#inodes_tree",
			placement: 'right auto',
			title: "THE 'SHARED WITH ME' FOLDER",
			content: [
				'<p> Files will appear in the \'Shared With Me\' folder as long as they are shared with you.</p>',
				'<p> They don\'t take any of your capacity so don\'t worry about having a lot of huge files there</p>',
			].join('\n')
		});

		$scope.guides.shared_with_me.steps.push({
			element: "#inodes_tree",
			placement: 'right auto',
			title: "THE 'SHARED WITH ME' FOLDER",
			content: [
				'<p> As you are not the owner of the file, it can be removed by the owner at any point.</p>',
				'<p> If you think you might be interested in viewing this file later, just copy it to your account.</p>',
			].join('\n')
		});

		$scope.guides.shared_with_me.steps_ready();



		//// CO SHARING ////

		$scope.guides.cosharing.steps.push({
			title: "CO-SHARING",
			content: [
				'<p>This guide will show you how to get cloud storage space simply by co-sharing.</p>',
				'<p>Co-sharing is the key to gain access to unlimited fast cloud storage - ',
				' it enables NooBaa to convert local hard drive resources into cloud resources.</p>',
			].join('\n')
		});

		$scope.guides.cosharing.steps.push({
			title: "REQUIREMENTS",
			content: [
				'<p>In order to co-share all you will need is a Computer ',
				'connected to the Internet with some underutilized storage.</p>',
			].join('\n')
		});

		$scope.guides.cosharing.steps.push({
			title: "COSTS",
			content: [
				'<p>FREE for any capacity.</p>',
				'<p>FREE for any number of files.</p>',
				'<p>FREE for unlimited sharing.</p>',
			].join('\n')
		});

		$scope.guides.cosharing.steps.push({
			element: "#space_button",
			placement: 'bottom',
			title: "DOWNLOAD -> INSTALL -> LOGIN",
			content: [
				'<p>Download the NooBaa client for your OS.</p>',
				'<p><small>(we are working with the Chrome team to resolve the download warning)</small></p>',
				'<p>Run the installer.</p>',
				'<p>When the program starts, login to your Facebook/Google account.',
			].join('\n'),
			onShow: function() {
				$scope.$root.$broadcast('show_planet_downloads_view');
			}
		});

		$scope.guides.cosharing.steps.push({
			title: "MAKING SPACE",
			content: [
				'<p>In the client window use the button <a class="btn btn-danger"><i class="icon-rocket"></i></a>',
				'to add space to your account.</p>',
				'<p>NooBaa will allocate the same amount of storage from your hard drive free space.</p>',
				'<p>You can keep adding more as you go.</p>',
			].join('\n')
		});

		$scope.guides.cosharing.steps.push({
			title: "CLIENT UPLOAD",
			content: [
				'<p>In the client window use the button <a class="btn btn-success"><i class="icon-cloud-upload"></i></a>',
				'to upload files or folders to you account.</p>',
				'<p>Using the client upload is better than the web browser',
				'because it will resume even if disconnected or rebooted.</p>'
			].join('\n')
		});

		$scope.guides.cosharing.steps.push({
			title: "AWESOME",
			content: [
				'<p>Enjoy the power of NooBaa\'s crowd-cloud and spread the word!</p>',
			].join('\n')
		});

		$scope.guides.cosharing.steps_ready();
	}

})();