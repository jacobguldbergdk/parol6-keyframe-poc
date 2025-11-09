'use client';

import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { useConfigStore, Config } from '../lib/configStore';
import { getApiBaseUrl } from '../lib/apiConfig';

export default function SettingsPage() {
  const { config, isLoading, error, fetchConfig, saveConfig } = useConfigStore();
  const [localConfig, setLocalConfig] = useState<Config | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [availablePorts, setAvailablePorts] = useState<(string | { device: string; description: string; hwid: string })[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);

  // Fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Fetch available COM ports
  useEffect(() => {
    const fetchPorts = async () => {
      setLoadingPorts(true);
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/config/com-ports`);
        if (response.ok) {
          const data = await response.json();
          setAvailablePorts(data.ports || []);
        }
      } catch (error) {
        console.error('Failed to fetch COM ports:', error);
      } finally {
        setLoadingPorts(false);
      }
    };
    fetchPorts();
  }, []);

  // Update local state when config changes
  useEffect(() => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config))); // Deep copy
      setHasChanges(false);
    }
  }, [config]);

  const handleSave = async () => {
    if (!localConfig) return;

    setIsSaving(true);
    try {
      await saveConfig(localConfig);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config)));
      setHasChanges(false);
    }
  };

  const updateConfig = (path: string[], value: any) => {
    if (!localConfig) return;

    const newConfig = JSON.parse(JSON.stringify(localConfig));
    let current = newConfig;

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;

    setLocalConfig(newConfig);
    setHasChanges(true);
  };

  if (isLoading && !localConfig) {
    return (
      <main className="h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="p-8">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 text-center">Error Loading Config</h2>
            <p className="text-muted-foreground text-center">{error}</p>
            <Button onClick={fetchConfig} className="mt-4 mx-auto block">
              Retry
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  if (!localConfig) return null;

  // Ensure ui config exists
  if (!localConfig.ui) {
    return (
      <main className="h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-muted-foreground">UI configuration is missing</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-background">
      <Header />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header with Save/Reset Buttons */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground">Configure robot and UI preferences</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Basic Settings */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Basic Settings</h2>
            <div className="space-y-4">
              {/* Theme */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Theme</Label>
                <Select
                  value={localConfig.ui.theme}
                  onValueChange={(value) => updateConfig(['ui', 'theme'], value)}
                >
                  <SelectTrigger className="col-span-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Default Speed Percentage */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Default Speed %</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={localConfig.ui.default_speed_percentage}
                  onChange={(e) =>
                    updateConfig(['ui', 'default_speed_percentage'], parseInt(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>

              {/* Step Angle */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Step Angle (degrees)</Label>
                <Input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={localConfig.ui.step_angle}
                  onChange={(e) =>
                    updateConfig(['ui', 'step_angle'], parseFloat(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>

              {/* Show Safety Warnings */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Show Safety Warnings</Label>
                <div className="col-span-2 flex items-center">
                  <Checkbox
                    checked={localConfig.ui.show_safety_warnings}
                    onCheckedChange={(checked) =>
                      updateConfig(['ui', 'show_safety_warnings'], checked)
                    }
                  />
                </div>
              </div>

              {/* TCP Offset */}
              <div className="space-y-2">
                <Label>TCP Offset (mm)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">X</Label>
                    <Input
                      type="number"
                      value={localConfig.ui.tcp_offset.x}
                      onChange={(e) =>
                        updateConfig(['ui', 'tcp_offset', 'x'], parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Y</Label>
                    <Input
                      type="number"
                      value={localConfig.ui.tcp_offset.y}
                      onChange={(e) =>
                        updateConfig(['ui', 'tcp_offset', 'y'], parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Z</Label>
                    <Input
                      type="number"
                      value={localConfig.ui.tcp_offset.z}
                      onChange={(e) =>
                        updateConfig(['ui', 'tcp_offset', 'z'], parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* WebSocket Settings */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">WebSocket Settings</h2>
            <div className="space-y-4">
              {/* Default Rate */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Update Rate (Hz)</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={localConfig.frontend.websocket.default_rate_hz}
                  onChange={(e) =>
                    updateConfig(['frontend', 'websocket', 'default_rate_hz'], parseInt(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>

              {/* Max Reconnect Attempts */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Max Reconnect Attempts</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={localConfig.frontend.websocket.reconnect.max_attempts}
                  onChange={(e) =>
                    updateConfig(['frontend', 'websocket', 'reconnect', 'max_attempts'], parseInt(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>

              {/* Reconnect Delay */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Reconnect Delay (ms)</Label>
                <Input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={localConfig.frontend.websocket.reconnect.base_delay_ms}
                  onChange={(e) =>
                    updateConfig(['frontend', 'websocket', 'reconnect', 'base_delay_ms'], parseInt(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>
            </div>
          </Card>

          {/* Logging Settings */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Logging Settings</h2>
            <div className="space-y-4">
              {/* Log Level */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Log Level</Label>
                <Select
                  value={localConfig.logging.level}
                  onValueChange={(value) => updateConfig(['logging', 'level'], value)}
                >
                  <SelectTrigger className="col-span-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBUG">DEBUG</SelectItem>
                    <SelectItem value="INFO">INFO</SelectItem>
                    <SelectItem value="WARNING">WARNING</SelectItem>
                    <SelectItem value="ERROR">ERROR</SelectItem>
                    <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Buffer Size */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Buffer Size</Label>
                <Input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={localConfig.logging.buffer_size}
                  onChange={(e) =>
                    updateConfig(['logging', 'buffer_size'], parseInt(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>

              {/* Initial Log Count */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Initial Log Count</Label>
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={localConfig.logging.initial_log_count}
                  onChange={(e) =>
                    updateConfig(['logging', 'initial_log_count'], parseInt(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>
            </div>
          </Card>

          {/* Advanced Settings */}
          <Card className="p-6 border-yellow-500/50">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <h2 className="text-xl font-semibold">Advanced Settings</h2>
                <p className="text-sm text-yellow-600 dark:text-yellow-500">
                  Changes to these settings require restarting the backend server
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {/* COM Port */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>COM Port</Label>
                {loadingPorts ? (
                  <div className="col-span-2 flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Scanning ports...</span>
                  </div>
                ) : availablePorts.length > 0 ? (
                  <Select
                    value={localConfig.robot.com_port}
                    onValueChange={(value) => updateConfig(['robot', 'com_port'], value)}
                  >
                    <SelectTrigger className="col-span-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePorts.map((port) => {
                        const portValue = typeof port === 'string' ? port : port.device;
                        const portLabel = typeof port === 'string' ? port : `${port.device} - ${port.description}`;
                        return (
                          <SelectItem key={portValue} value={portValue}>
                            {portLabel}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={localConfig.robot.com_port}
                    onChange={(e) => updateConfig(['robot', 'com_port'], e.target.value)}
                    placeholder="No ports detected - enter manually"
                    className="col-span-2"
                  />
                )}
              </div>

              {/* Baud Rate */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Baud Rate</Label>
                <Input
                  type="number"
                  value={localConfig.robot.baud_rate}
                  onChange={(e) =>
                    updateConfig(['robot', 'baud_rate'], parseInt(e.target.value))
                  }
                  className="col-span-2"
                />
              </div>

              {/* Auto Home on Startup */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>Auto Home on Startup</Label>
                <div className="col-span-2 flex items-center">
                  <Checkbox
                    checked={localConfig.robot.auto_home_on_startup}
                    onCheckedChange={(checked) =>
                      updateConfig(['robot', 'auto_home_on_startup'], checked)
                    }
                  />
                </div>
              </div>

              {/* API Port */}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label>API Port</Label>
                <Input
                  type="number"
                  min="1024"
                  max="65535"
                  value={localConfig.api.port}
                  onChange={(e) => updateConfig(['api', 'port'], parseInt(e.target.value))}
                  className="col-span-2"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
