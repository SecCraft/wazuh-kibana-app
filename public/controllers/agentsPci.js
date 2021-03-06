// Require config
var app = require('ui/modules').get('app/wazuh', []);

app.controller('PCIController', function ($scope, DataFactory, $mdToast, errlog, appState, genericReq) {
	$scope.defaultManagerName = appState.getDefaultManager().name;
	
	var tabs = [];
	genericReq.request('GET', '/api/wazuh-api/pci/all').then(function (data) {
		angular.forEach(data, function(value, key) {
			tabs.push({"title": key, "content": value});
		});
		
	});
    
	$scope.tabs = tabs;
    $scope.selectedIndex = 0;
	
    $scope.addTab = function (title, view) {
      view = view || title + " Content View";
      tabs.push({ title: title, content: view, disabled: false});
    };
	
    $scope.removeTab = function (tab) {
      var index = tabs.indexOf(tab);
      tabs.splice(index, 1);
    };
	
    //Print Error
    var printError = function (error) {
        $mdToast.show({
            template: '<md-toast>' + error.html + '</md-toast>',
            position: 'bottom left',
            hideDelay: 5000,
        });
    }

});
