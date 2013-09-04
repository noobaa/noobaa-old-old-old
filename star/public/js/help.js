function HelpCtrl($scope, $http) {
	$scope.str2id = function(str) {
		return str.split(' ').join('');
	};

	$scope.client_faq = {
		title: 'NooBaa client FAQ',
		questions: [{
			q: 'Must I download and install the client to use NooBaa?',
			a: [
				'No. You can take NooBaa for a test drive without downloading the client. ',
				'Keep in mind that this is a co-sharing community. ',
				'If you don\'t intend to share you won\'t be able to fully enjoy the power of the crowd cloud'
			].join('\n')
		}, {
			q: 'Which operating systems do you support?',
			a: [
				'Access to the dashboard is done using a web browser so you can access your data from anywhere. ',
				'The NooBaa client is currently available for MacOS, Windows and Linux.',
			].join('\n')
		}]
	};

	$scope.login_faq = {
		title: 'Facebook Login FAQ',
		questions: [{
			q: 'Why do you require a Facebook login?',
			a: [
				'All you data on NooBaa is kept private, so we had to provide you with way to authenticate your identity. ',
				'As we can never remember our own passwords, and reusing passwords is a bad habit, ',
				'why would we force another nuisance on you?!',
			].join('\n')
		}, {
			q: 'Why don\'t you allow me to login with my email?',
			a: [
				'NooBaa is a social aware netowrk, i.e. it allows you to quickly share with your Facebook friends who are also NooBaa users.',
				' With Facebook you don\'t need to create yet another contacts/friends list',
			].join('\n')
		}, {
			q: 'I don\'t have a Facebook user and would like to use NooBaa anyway.',
			a: [
				'We currently only support Facebook login so the easiest path would be to sign up to Facebook.',
				'We plan to allow a variety of other login accounts such as Google and Twitter but not very soon.',
			].join('\n')
		}, {
			q: 'Why only Facebook and why Facebook first?',
			a: [
				'The chances you already have a Facebook account are higher compared to all the rest.',
			].join('\n')
		}, {
			q: 'Must I Like your page on Facebook?',
			a: [
				'No. It would be beneficial to everybody as we\'re building a community and not a passive service. ',
				'Communicating with our customers would help us do the right thing.',
			].join('\n')
		}, {
			q: 'Why does Facebook ask me to approve your access?',
			a: [
				'This is done in order to keep your privacy. Every Facebook access shows a dialog with the access ',
				'reqeust the service provider, NooBaa, is making.',
				'As we would like to make it easy to share with your Facebook friends so it requires access to your facebook list.',
				'We need your email to be able to communicate with you outside of NooBaa.',
				'We won\'t post on your wall or add you to any newsletter without getting your explicit permission first.'
			].join('\n')
		}, {
			q: 'Do you have access to my Facebook password or data?',
			a: [
				'No. NooBaa can\'t read your password nor can it post to your wall.',
			].join('\n')
		}],
	};
}
HelpCtrl.$inject = ['$scope', '$http'];