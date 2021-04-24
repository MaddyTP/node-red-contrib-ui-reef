/**
 * Copyright 2021 Bart Butenaers & hotNipi
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * */

module.exports = function (RED) {
    var settings = RED.settings;
    const state = require("./state.js")(RED);

    function HTML(config) {
        config.id = config.id.replace(".", "_");
        var configAsJson = JSON.stringify(config);
        var html = String.raw`
      <style>
          .multistate-switch-container{
              display: block;
              width:100%;
              margin:auto;
              padding: 3px;
          }
          .multistate-switch-header{
              display: flex;
                justify-content: space-between;
              font-size: 14px;
              font-weight: 500;
              letter-spacing: .1em;
              text-transform: uppercase;
              margin: 0.1em;
              padding-left: 2px;
              padding-right: 2px;
          }
          .multistate-switch-config{
              color: #999;
              cursor: pointer;
          }
          .multistate-switch-wrapper.disabled{
              border-color:gray;
              border-style:dashed;
          }
          .multistate-switch-wrapper{
              border:1px solid var(--nr-dashboard-widgetColor);
              display: flex;
              flex-flow: column nowrap;
              justify-content: center;
              align-items: center;
              position:relative;
              font-size: 14px;
              font-weight: 425;
              letter-spacing: .06em;
              text-transform: uppercase;
              margin: auto 0;
              width:100%;
              height: 1.55em;
          }
          .multistate-slider-wrapper.disabled{
              opacity:0.5;
          }
          .multistate-slider-wrapper{
              height: 1em;
              padding-top: 0.25em;
              padding-bottom: 0.25em;
              z-index:0
          }
          .multistate-switch-body.disabled{
              color:gray;
              pointer-events:none; 
          }
          .multistate-switch-body{
              pointer-events:auto;
              display: inline-flex;
              justify-content: flex-start;
              width: 100%;
          }
          .multistate-switch-slider-${config.id}{
              width: calc((100% - (${config.options.length} * 0.2em)) / ${config.options.length});
          }
          .multistate-switch-slider{                
              background-color: var(--nr-dashboard-widgetColor);
              position: absolute;
              height: 1.2em;
              transform: translate(0.1em, -0.25em);
              transition: all .4s ease;
              left: 0%;
              z-index:0;
          }
          .multistate-switch-button-${config.id}{
              width:calc(100% / ${config.options.length}); 
          }
          .multistate-switch-button.disabled{
              pointer-events:none !important;
          }
          .multistate-switch-button.dark{
              color:var(--nr-dashboard-widgetBgndColor)
          }
          .multistate-switch-button.light{
              color:var(--nr-dashboard-widgetTextColor)
          }
          .multistate-switch-button{              
             text-align:center;
             z-index:1;
             outline: none;
             user-select:none;
             cursor:pointer;
             line-height: 1.2em;
             transition: color 0.5s ease;
          }
          .multistate-switch-round{
              border-radius: 0.8em;
          }
      </style>
      <div class="multistate-switch-container" ng-init='init(` + configAsJson + `)'>
          <div ng-if="${config.label != ""}" class="multistate-switch-header">
              <div>${config.label}</div>
              <div>
                  <span>{{inputState}}</span>
                  <i class="fa fa-cog multistate-switch-config"></i>
              </div>
          </div>
          <div id="multiStateSwitchContainer_` + config.id + `" class="multistate-switch-wrapper multistate-switch-round">
              <div id="multiStateSwitchBody_` + config.id + `"" class="multistate-switch-body">
                  <div id="multiStateSwitchSliderWrapper_` + config.id + `" class="multistate-slider-wrapper">
                      <div id="multiStateSwitchSlider_` + config.id + `" class="multistate-switch-slider multistate-switch-round multistate-switch-slider-` + config.id + `"></div>
                  </div>
                  <!-- The radio buttons will be inserted here dynamically on the frontend side -->
              </div>
          </div>
      </div>
      `;

        return html;
    }

    function checkConfig(node, conf) {
        if (!conf || !conf.hasOwnProperty("group")) {
            node.error("No group has been specified");
            return false;
        }
        return true;
    }

    function OutletNode(config) {
        try {
            var ui = RED.require("node-red-dashboard")(RED);
            config.dark = false
            if (typeof ui.isDark === "function") {
                config.dark = ui.isDark()
                config.widgetColor = ui.getTheme()['widget-backgroundColor'].value
            }
            RED.nodes.createNode(this, config);
            var node = this;
            
            if (checkConfig(node, config)) {              
                var html = HTML(config);
                var done = ui.addWidget({
                    node: node,
                    group: config.group,
                    order: config.order,
                    width: config.width,
                    height: config.height,
                    format: html,
                    templateScope: "local",
                    emitOnlyNewValues: true,
                    forwardInputMessages: false,
                    storeFrontEndInputAsState: true,
                    convertBack: function (value) {
                        return value;
                    },
                    beforeEmit: function (msg, value) {
                        var newMsg = {};
                        if (msg) {
                            newMsg.socketid = msg.socketid;
                            newMsg.state = RED.util.getMessageProperty(msg, config.stateField || 'payload');
                            newMsg.enable = RED.util.getMessageProperty(msg, config.enableField || 'enable');
                            newMsg.input = RED.util.getMessageProperty(msg, config.inputField || 'input');
                        }
                        return { msg: newMsg };
                    },
                    beforeSend: function (msg, orig) {
                        if (orig) {
                            var newMsg = {};
                            RED.util.setMessageProperty(newMsg, config.stateField, orig.msg.state, true);
                            node.context().set('state', orig.msg.state);
                            return newMsg;
                        }
                    },
                    initController: function ($scope, events) {
                        $scope.flag = true;
                        $scope.init = function (config) {
                            $scope.config = config;
                            $scope.containerDiv = $("#multiStateSwitchContainer_" + config.id)[0];
                            $scope.sliderDivElement = $("#multiStateSwitchSlider_" + config.id)[0];
                            $scope.sliderWrapperElement = $("#multiStateSwitchSliderWrapper_" + config.id)[0];
                            // Get a reference to the sub-DIV element
                            var toggleRadioDiv = $scope.containerDiv.firstElementChild;
                            // Create all the required  button elements
                            config.options.forEach(function (option, index) {
                                var divElement = document.createElement("div");
                                divElement.setAttribute("class", "multistate-switch-button multistate-switch-button-" + config.id);
                                divElement.setAttribute("id", "mstbtn_" + config.id + "_" + index)
                                divElement.innerHTML = option.label;
                                divElement.addEventListener("click", function () {
                                    switchStateChanged(option.value, true);
                                });
                                toggleRadioDiv.appendChild(divElement);
                            });
                            // Make sure the initial element gets the correct color
                            switchStateChanged(config.options[0].value, false);
                        }
                        $scope.$watch('msg', function (msg) {
                            // Ignore undefined messages.
                            if (!msg) {
                                return;
                            }
                            if (msg.enable === true || msg.enable === false) {
                                disable(!msg.enable);
                                return;
                            }
                            if (msg.input != undefined) {
                                $scope.inputState = msg.input;
                            }
                        });

                        function disable(state) {
                            //true - widget disabled, false - widget enabled
                            if (state == true) {
                                $("#multiStateSwitchContainer_" + $scope.config.id).addClass('disabled')
                                $("#multiStateSwitchBody_" + $scope.config.id).addClass('disabled')
                                $("#multiStateSwitchSliderWrapper_" + $scope.config.id).addClass('disabled')
                                $scope.config.options.forEach(function (option, index) {
                                    $("#mstbtn_" + $scope.config.id + "_" + index).addClass('disabled')
                                });
                            }
                            else {
                                $("#multiStateSwitchContainer_" + $scope.config.id).removeClass('disabled')
                                $("#multiStateSwitchBody_" + $scope.config.id).removeClass('disabled')
                                $("#multiStateSwitchSliderWrapper_" + $scope.config.id).removeClass('disabled')
                                $scope.config.options.forEach(function (option, index) {
                                    $("#mstbtn_" + $scope.config.id + "_" + index).removeClass('disabled')
                                });
                            }
                        }

                        function txtClassToStandOut(bgColor, light, dark) {
                            var color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
                            var r = parseInt(color.substring(0, 2), 16);
                            var g = parseInt(color.substring(2, 4), 16);
                            var b = parseInt(color.substring(4, 6), 16);
                            var uicolors = [r / 255, g / 255, b / 255];
                            var c = uicolors.map((col) => {
                                if (col <= 0.03928) {
                                    return col / 12.92;
                                }
                                return Math.pow((col + 0.055) / 1.055, 2.4);
                            });
                            var L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
                            if ($scope.config.dark) {
                                return (L > 0.35) ? dark : light;
                            }
                            return (L > 0.35) ? light : dark;
                        }

                        function switchStateChanged(newValue, sendMsg) {
                            var divIndex = -1;
                            // Try to find an option with a value identical to the specified value
                            // For every button be sure that button exists and change mouse cursor and pointer-events
                            $scope.config.options.forEach(function (option, index) {
                                if ($("#mstbtn_" + $scope.config.id + "_" + index).length) {
                                    $("#mstbtn_" + $scope.config.id + "_" + index).css({ "cursor": "pointer", "pointer-events": "auto" })
                                    $("#mstbtn_" + $scope.config.id + "_" + index).removeClass("light dark")
                                    if (option.value == newValue) {
                                        // selected button inactive                                                                                                                     
                                        $("#mstbtn_" + $scope.config.id + "_" + index).css({ "cursor": "default", "pointer-events": "none" })
                                        // ensure the button text stand out
                                        var color = $scope.config.useThemeColors ? $scope.config.widgetColor : option.color ? option.color : $scope.config.widgetColor
                                        $("#mstbtn_" + $scope.config.id + "_" + index).addClass(txtClassToStandOut(color, "light", "dark"))
                                        divIndex = index;
                                    }
                                }
                            });

                            if (divIndex >= 0) {
                                var percentage = "0%";
                                if ($scope.config.options.length > 0 && divIndex >= 0) {
                                    percentage = (100 / $scope.config.options.length) * divIndex;
                                    $scope.sliderDivElement.style.left = percentage + "%";
                                    if ($scope.config.useThemeColors != true) {
                                        $scope.sliderDivElement.style.backgroundColor = $scope.config.options[divIndex].color;
                                    }
                                }
                                // Make sure that numbers always appear as numbers in the output message (instead of strings)
                                if ($scope.config.options[divIndex].valueType === "num") {
                                    newValue = Number(newValue);
                                }
                                if ($scope.config.options[divIndex].valueType === "bool") {
                                    if (newValue === 'true') {
                                        newValue = true;
                                    } else {
                                        newValue = false;
                                    }
                                }
                                if (sendMsg) {
                                    $scope.send({ state: newValue });
                                }
                            }
                            else {
                                console.log("No radio button has value '" + newValue + "'");
                            }
                        }
                    }
                });
            }
        }
        catch (e) {
            node.error(e);
            console.trace(e);
        }

        node.on("close", function () {
            if (done) {
                done();
            }
        });
    }

    RED.nodes.registerType("outlet", OutletNode);
}
