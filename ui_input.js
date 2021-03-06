const path = require('path');
module.exports = function (RED) {
  function HTML(config) {
    config.id = config.id.replace('.', '_');
    const configAsJson = JSON.stringify(config);
    const html = String.raw`
        <style>
            .ui-input-slider-${config.id}{
                width: calc((100% - (${config.options.length} * 0.2em)) / ${config.options.length});
            }
            .ui-input-button-${config.id}{
                width:calc(100% / ${config.options.length}); 
                pointer-events:none;
            }
        </style>
        <link href='ui-reef/css/uireef.css' rel='stylesheet' type='text/css'>
        <div class="ui-input-container" ng-init='init(${configAsJson})'>
                <div ng-if="${config.label !== ''}" class="ui-input-header">${config.label}</div>
            <div id="uiInputContainer_${config.id}" class="ui-input-wrapper ui-input-round">
                <div id="uiInputBody_${config.id}"" class="ui-input-body">
                    <div id="uiInputSliderWrapper_${config.id}" class="ui-input-slider-wrapper">
                        <div id="uiInputSlider_${config.id}" class="ui-input-slider ui-input-round ui-input-slider-${config.id}"></div>
                    </div>
                    <!-- The radio buttons will be inserted here dynamically on the frontend side -->
                </div>
            </div>
        </div>
        `;
    return html;
  }
  let ui;
  function InputNode(config) {
    const node = this;
    try {
      if (ui === undefined) {
        ui = RED.require('node-red-dashboard')(RED);
      }
      config.dark = false;
      if (typeof ui.isDark === 'function') {
        config.dark = ui.isDark();
        config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
      }
      RED.nodes.createNode(node, config);
      const html = HTML(config);
      const ui_done = ui.addWidget({
        node,
        group: config.group,
        order: config.order,
        width: config.width,
        height: config.height,
        format: html,
        templateScope: 'local',
        emitOnlyNewValues: false,
        forwardInputMessages: false,
        storeFrontEndInputAsState: true,
        beforeEmit: function (msg) {
          const newMsg = {};
          newMsg.socketid = msg.socketid;
          newMsg.state = RED.util.getMessageProperty(msg, config.stateField || 'payload');
          return { msg: newMsg };
        },
        initController: function ($scope) {
          $scope.flag = true;
          $scope.init = function (config) {
            $scope.config = config;
            $scope.containerDiv = $(`#uiInputContainer_${config.id}`)[0];
            $scope.sliderDivElement = $(`#uiInputSlider_${config.id}`)[0];
            $scope.sliderWrapperElement = $(`#uiInputSliderWrapper_${config.id}`)[0];
            const toggleRadioDiv = $scope.containerDiv.firstElementChild;
            config.options.forEach(function (option, index) {
              const divElement = document.createElement('div');
              divElement.setAttribute('class', `ui-input-button ui-input-button-${config.id}`);
              divElement.setAttribute('id', `uiibtn_${config.id}_${index}`);
              divElement.innerHTML = option.label;
              toggleRadioDiv.appendChild(divElement);
            });
          };
          function txtClassToStandOut(bgColor, light, dark) {
            const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
            const r = parseInt(color.substring(0, 2), 16);
            const g = parseInt(color.substring(2, 4), 16);
            const b = parseInt(color.substring(4, 6), 16);
            const uicolors = [r / 255, g / 255, b / 255];
            const c = uicolors.map(function (col) {
              if (col <= 0.03928) {
                return col / 12.92;
              }
              return (col + 0.055) / 1.055 ** 2.4;
            });
            const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
            if ($scope.config.dark) {
              return (L > 0.35) ? dark : light;
            }
            return (L > 0.35) ? light : dark;
          }
          function switchStateChanged(newValue) {
            $scope.config.options.forEach(function (option, index) {
              if ($(`#uiibtn_${$scope.config.id}_${index}`).length) {
                $(`#uiibtn_${$scope.config.id}_${index}`).removeClass('light dark');
                if (option.value === newValue) {
                  const color = $scope.config.useThemeColors ? $scope.config.widgetColor : option.color ? option.color : $scope.config.widgetColor;
                  $(`#uiibtn_${$scope.config.id}_${index}`).addClass(txtClassToStandOut(color, 'light', 'dark'));
                  let percentage = '0%';
                  percentage = (100 / $scope.config.options.length) * index;
                  $scope.sliderDivElement.style.left = `${percentage}%`;
                  if ($scope.config.useThemeColors !== true) {
                    $scope.sliderDivElement.style.backgroundColor = $scope.config.options[index].color;
                  }
                }
              }
            });
          }
          $scope.$watch('msg', function (msg) {
            if (msg && msg.state !== undefined) {
              switchStateChanged(msg.state.toString());
            }
          });
        },
      });
      node.on('close', function () {
        ui_done();
      });
    } catch (e) {
      node.error(e);
    }
  }
  RED.nodes.registerType('ui_input', InputNode);
  const uipath = ((RED.settings.ui || {}).path) || 'ui';
  const fullPath = path.join(RED.settings.httpNodeRoot, uipath, '/ui-reef/*').replace(/\\/g, '/');
  RED.httpNode.get(fullPath, function (req, res) {
    const options = {
      root: `${__dirname}/lib/`,
      dotfiles: 'deny',
    };
    res.sendFile(req.params[0], options);
  });
};
