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

 const path = require('path');

 module.exports = (RED) => {
    function checkConfig(node, conf) {
        if (!conf || !conf.hasOwnProperty('group')) {
            node.error(RED._('table.error.no-group'));
            return false;
        }
        else {
            return true;
        }
    }
    
    function HTML(config) {
        config.id = config.id.replace('.', '_');
        const configAsJson = JSON.stringify(config);
        const html = String.raw`
        <link href='ui-reef/css/uireef.css' rel='stylesheet' type='text/css'>
        <script type='text/javascript' src='ui-reef/js/highcharts.js'></script>
        <div class="probe-container" ng-init='init(${configAsJson})'>
            <div id="uiProbeChart_${config.id}" class="probe-chart"></div>
            <div class="probe-label">
                <div class="probe-name">${config.label}</div>
                <div class="probe-value">{{inputValue}}</div>
            </div>
        </div>
       `;
        return html;
    }

    let ui;

    function ProbeNode(config) {
        const node = this;
        try {
            if (checkConfig(node, config)) {
                if (ui === undefined) {
                    ui = RED.require('node-red-dashboard')(RED);
                }

                config.dark = false;
                if (typeof ui.isDark === 'function') {
                    config.dark = ui.isDark();
                    config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
                }

                RED.nodes.createNode(this, config);

                const html = HTML(config);
                const done = ui.addWidget({
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
                    convertBack: (data) => {
                        if (data) {
                            if (data[0] && data[0].hasOwnProperty('values')) {
                                return [data[0].values];
                            }
                            if (data.length == 0) {
                                return [];
                            }
                        }
                    },
                    beforeEmit: (msg) => {
                        if (msg) {
                            const newMsg = {};
                            newMsg.socketid = msg.socketid;
                            newMsg.chart = RED.util.getMessageProperty(msg, config.chartField || 'payload');
                            newMsg.value = RED.util.getMessageProperty(msg, config.valueField || 'payload');
                            return { msg: newMsg };
                        }
                        return msg;
                    },
                    beforeSend: (msg, orig) => {
                        return msg;
                    },
                    initController: ($scope) => {
                        $scope.flag = true;
                        $scope.chartDiv;
                        $scope.init = (config) => {
                            $scope.config = config;
                            $scope.unique = $scope.$eval('$id');
                            $scope.inputValue = 231;
                            $scope.chartDiv = new Highcharts.chart('uiProbeChart_' + $scope.config.id, {
                                chart: {
                                    type: 'spline',
                                    backgroundColor: '#EAF4FA',
                                },
                                title: {
                                    text: ''
                                },
                                subtitle: {
                                    text: ''
                                },
                                xAxis: {
                                    visible: false,
                                    type: 'datetime',
                                },
                                yAxis: {
                                    visible: false,
                                    startOnTick: false,
                                    endOnTick: false,
                                    maxPadding: 0.01,
                                },
                                tooltip: {
                                    headerFormat: '',
                                    pointFormat: '{point.y:.2f}'
                                },
                                legend: {
                                    enabled: false,
                                },
                                credits: {
                                    enabled: false,
                                },
                                plotOptions: {
                                    series: {
                                        lineColor: '#0094CE',
                                    }
                                },
                                series: [{}],
                                exporting: {
                                    enabled: false,
                                }
                            });
                            $scope.chartDiv.reflow();
                        };

                        $scope.$watch('msg', (msg) => {
                            if (msg) {
                                $scope.chartDiv.series[0].setData(msg.chart, true);
                                $scope.chartDiv.reflow();
                            }
                        });
                    },
                });

                node.on('close', () => {
                    done();
                });
            }
        } catch (e) {
            node.error(e);
        }
    }
    RED.nodes.registerType('ui_probe', ProbeNode);

    const uipath = RED.settings.ui.path || 'ui';
    const fullPath = path.join(RED.settings.httpNodeRoot, uipath, '/ui-reef/*').replace(/\\/g, '/');

    RED.httpNode.get(fullPath, function (req, res) {
        var options = {
            root: __dirname + '/lib/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options)
    });
};
