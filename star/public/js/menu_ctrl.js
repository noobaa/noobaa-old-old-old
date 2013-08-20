var global_menu_bar_rewind_guide;

MenuBarCtrl.$inject = ['$scope', '$location'];

function MenuBarCtrl($scope, $location) {

	$scope.active_link = function(link) {
		return link === $location.path() ? 'active' : '';
	};

	function guide_template(i, step) {
		return [
			'<div class="popover tour" style="max-width: 500px">',
			'  <div class="arrow"></div>',
			'  <h1 class="popover-title fntread"></h1>',
			'  <div class="popover-content fnttour"></div>',
			'  <div class="popover-navigation text-center">',
			'    <span class="pull-left fnttour">',
					(i+1),'/',step.guide.steps.length,'</span>',
			'    <a href="#" data-role="rewind" onclick="global_menu_bar_rewind_guide()">',
			'      <i class="icon-fast-backward icon-3x icon-fixed-width"></i></a>',
			'    <a href="#" data-role="prev">',
			'      <i class="icon-step-backward icon-3x icon-fixed-width"></i></a>',
			'    <a href="#" data-role="end">',
			'      <i class="icon-stop icon-3x icon-fixed-width"></i></a>',
			'    <a href="#" data-role="next">',
			'      <i class="icon-play icon-3x icon-fixed-width"></i></a>',
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
		this.completed = localStorage[name + '_completed'] === 'true';
		this.tour = new Tour({
			name: name,
			debug: true,
			template: guide_template,
			onStart: function() {
				if ($scope.running_guide) {
					$scope.running_guide.tour.end();
				}
				$scope.running_guide = me;
				$scope.safe_apply();
			},
			onEnd: function() {
				if (me.tour._current + 1 === me.steps.length) {
					// mark persistent completion when last step is reached
					localStorage[name + '_completed'] = 'true';
					me.completed = true;
				}
				$scope.running_guide = null;
				$scope.safe_apply();
			}
		});
	}

	// called after the steps array is full and ready.
	// it should remain unchanged once it is called.
	Guide.prototype.steps_ready = function() {
		var me = this;
		_.each(this.steps, function(step) {
			// link backwards. helpfull in the template function
			step.guide = me;
		});
		// add the steps array to the tour.
		this.tour.addSteps(this.steps);
		// handle redirections here - need to start the tour which did redirect
		// so we identify simply by the first that's not ended and not on first step.
		if (!this.tour.ended() && this.tour._current && !$scope.running_guide) {
			this.tour.start();
		}
		// console.log(this);
	};

	Guide.prototype.is_completed = function() {
		// TODO: for now just check for tour end, but this is where we want 
		// to check for more complex conditions - such as did the user really share, etc
		return this.completed;
	};

	Guide.prototype.run = function() {
		if (this.tour.ended()) {
			// when the tour ended, only restart can redeem it
			// but we want to implement "pause" so we keep
			// and restore the step number.
			var i = this.tour._current;
			this.tour.restart();
			this.tour.goto(i);
		} else {
			this.tour.start();
		}
	}

	global_menu_bar_rewind_guide = function() {
		console.log($scope.running_guide);
		if ($scope.running_guide) {
			$scope.running_guide.tour.goto(0);
		}
		$scope.safe_apply();
	};

	// define guides in order
	$scope.guides_list = [
		new Guide('welcome', 'Welcome'),
		new Guide('upload_file', 'Uploading'),
		new Guide('open_file', 'Accessing'),
		new Guide('share_file', 'Sharing'),
		new Guide('shared_with_me', 'Shared with me'),
		new Guide('cosharing', 'Co-Sharing the cloud')
	];

	// also create map by name for easier access
	$scope.guides = {};
	_.each($scope.guides_list, function(guide) {
		$scope.guides[guide.name] = guide;
	});


	//// WELCOME ////

	$scope.guides.welcome.steps[0] = {
		element: "#logo_link",
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME",
		content: [
			'<p>Hi,</p>',
			'<p>NooBaa was created for you to finally be able to',
			'Access, Share and Protect</p>',
			'<p><b>EVERY</b> file you have from anywhere,</p>',
			'<p>including your extreme media files!</p>'
		].join('\n')
	};
	$scope.guides.welcome.steps[1] = {
		element: "#upload_button",
		placement: 'right',
		path: "/mydata",
		backdrop: false,
		title: "UPLOAD",
		content: [
			'<p>The first button you should meet is this upload button on the left.</p>',
			'<p>Use it and upload files to your account.</p>'
		].join('\n')
	}
	$scope.guides.welcome.steps[2] = {
		element: "#my_guides",
		placement: 'bottom',
		path: "/mydata",
		backdrop: true,
		title: "WHAT'S NEXT",
		content: [
			'<p>OK, You are ready to explore on your own.</p>',
			'<p>When you want to learn more,</p>',
			'<p>check out the next guides using this button (<i class="icon-info-sign text-info"></i>)</p>',
			'<p>Feel free to tell us what you think. We want to know.</p>',
			'<p>Have a good one!</p>',
			'<p>- The NooBaa Team -</p>'
		].join('\n')
	};
	$scope.guides.welcome.steps_ready();


	//// UPLOAD FILE ////

	$scope.guides.upload_file.steps[0] = {
		element: "#my_guides",
		placement: 'bottom',
		backdrop: true,
		title: "",
		content: [
			'<p>OK, lets go.</p>'
		].join('\n')
	};
	$scope.guides.upload_file.steps_ready();


	//// OPEN FILE ////

	$scope.guides.open_file.steps[0] = {
		element: "#my_guides",
		placement: 'bottom',
		backdrop: true,
		title: "",
		content: [
			'<p>OK, lets go.</p>'
		].join('\n')
	};
	$scope.guides.open_file.steps_ready();


	//// SHARE FILE ////

	$scope.guides.share_file.steps[0] = {
		element: "#my_guides",
		placement: 'bottom',
		backdrop: true,
		title: "",
		content: [
			'<p>OK, lets go.</p>'
		].join('\n')
	};
	$scope.guides.share_file.steps_ready();


	//// SHARED WITH ME ////

	$scope.guides.shared_with_me.steps[0] = {
		element: "#my_guides",
		placement: 'bottom',
		backdrop: true,
		title: "",
		content: [
			'<p>OK, lets go.</p>'
		].join('\n')
	};
	$scope.guides.shared_with_me.steps_ready();


	//// CO SHARING ////

	$scope.guides.cosharing.steps[0] = {
		element: "#my_guides", // jQuery selector
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME TO NOOBAA !",
		content: [
			'<p>Hi. I am your tour guide.<br></p>',
			'<p>To re-take the tour just press',
			' the <i class="icon-info-sign text-info"></i> button</p><p> on the top bar</p>',
			// '<p>* You can also navigate this tour using the left & right arrow keys</p>',
			// '<p>* This tour is always available using the',
			// '<i class="icon-info-sign text-info"></i> button at the top</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[1] = {
		element: "#my_data_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DATA",
		content: [
			'<p>This is where you manage your files.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[2] = {
		element: "#my_dev_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DEVICES",
		content: [
			'<p>This is where you manage your devices.</p>'
		].join('\n')
	}
	$scope.guides.cosharing.steps[3] = {
		element: "#dl",
		placement: 'top',
		backdrop: true,
		path: "/mydevices",
		title: "Install Device",
		content: [
			'<p>Start co-sharing by installing your first device.</p>',
			'<p>Download the software, unzip and run.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[4] = {
		element: "#devs",
		placement: 'bottom',
		backdrop: true,
		path: "/mydevices",
		title: "Connecting the Device",
		content: [
			'<p>When the application starts you will see the dashboard screen.</p>',
			'<p>Connect it with your facebook account.</p>',
			'<p>Once the connection is made, you should see your device listed here.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[5] = {
		element: "#my_data_link",
		placement: 'bottom',
		backdrop: true,
		reflex: true,
		path: "/mydevices",
		title: "First device added",
		content: [
			'<p>Once your device is up and running,',
			'you are co-sharing and enjoying the power of NooBaa\'s crowd-cloud!</p>',
			'<p>Lets go to MY DATA and meet your data...</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[6] = {
		element: "#my_data_link",
		placement: 'bottom',
		path: "/mydata",
		title: "MY DATA",
		content: [
			'<p>Let\'s see how to manage your data...</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[7] = {
		element: "#inodes_tree",
		placement: 'right',
		path: "/mydata",
		title: "Accessing Data",
		content: [
			'<p>The two basic folder are "My Data" and "Shared with me".</p>',
			'<ui><li><strong>"My Data" </strong>holds all files that were uploaded by you.</li>',
			'<li><strong>"Shared with me"</strong> shows friends files that were shared with you.</li></ul>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[8] = {
		element: "#main-btn-group",
		placement: 'bottom',
		path: "/mydata",
		title: "Uploading, Consuming, Sharing",
		content: [
			'<p>This is an area that is very useful when you access your data via tablet.</p>',
			'<p>Just mark the line in the files list, and activate the required action on it.</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps[9] = {
		element: "#my_guides", // jQuery selector
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME TO NOOBAA !",
		content: [
			'<p>This is where the tour ends.</p>',
			'<p>Remember you can re-take the tour by pressing',
			' the <i class="icon-info-sign text-info"></i> button</p><p> on the top bar.</p>',
			'<p>Press the <strong>Close</strong> button or go back to any step by pressing the <strong>Prev</strong> button.</p>',
			// '<p>* You can also navigate this tour using the left & right arrow keys</p>',
			// '<p>* This tour is always available using the',
			// '<i class="icon-info-sign text-info"></i> button at the top</p>'
		].join('\n')
	};
	$scope.guides.cosharing.steps_ready();
}