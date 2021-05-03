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
 module.exports = (RED) => {
    const Highcharts = require('highcharts');
    
    function HTML(config) {
        config.id = config.id.replace('.', '_');
        const configAsJson = JSON.stringify(config);
        const html = String.raw`
        <script src="https://code.highcharts.com/highcharts.src.js"></script>
        <style>
            .probe-container{
                display: flex;
                margin: auto;
                height: calc(100% - 6px);
                width: calc(100% - 6px);
                padding: 3px;
            }
            .probe-chart{
                border-radius: 8px;
                width: calc(100% - 75px);
                height: 100%
            }
            .probe-label{
                display: block;
                padding-left: 8px;
                padding-right: 4px;
                margin: auto;
                width: 75px;
            }
            .probe-name{
                line-height: 30px;
                letter-spacing: .1em;
                font-size: 15px;
                font-weight: 500;
                color: #666;
                text-align: center;
                text-transform: uppercase;
                border-bottom: 1px dashed #aaa;
            }
            .probe-value{
                position: relative;
                font-size: 30px;
                font-weight: 330;
                color: #0094CE;
                text-align: center;
            }
        </style>
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
                convertBack(data) {
                    return data;
                },
                convert: function(value, oldValue, msg) {
                    return;
                },
                beforeEmit(msg) {
                    if (msg) {
                        const newMsg = {};
                        newMsg.socketid = msg.socketid;
                        newMsg.state = RED.util.getMessageProperty(msg, config.stateField || 'payload');
                        return { msg: newMsg };
                    }
                    return msg;
                },
                beforeSend(msg, orig) {
                    return msg;
                },
                initController: ($scope) => {
                    $scope.flag = true;
                    $scope.init = (config) => {
                        $scope.config = config;
                        $scope.inputValue = 231;
                        const chartDiv = document.getElementById(`uiProbeChart_${config.id}`);
                        $scope.probeChart = Highcharts.chart(chartDiv, {
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
                            },
                            yAxis: {
                                visible: false,
                                startOnTick: false,
                                endOnTick: false,
                                maxPadding: 0.02,
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
                    };

                    $scope.$watch('msg', (msg) => {
                        if (msg) {
                            $scope.probeChart.series[0].setData(msg.payload);
                            $scope.probeChart.reflow();
                        }
                    });

                    

                },
            });

            node.on('close', () => {
                done();
            });
        } catch (e) {
            node.error(e);
        }
    }
    RED.nodes.registerType('ui_probe', ProbeNode);
};
