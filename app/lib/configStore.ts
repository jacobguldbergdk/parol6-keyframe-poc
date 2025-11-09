import { create } from 'zustand';
import { getApiBaseUrl } from './apiConfig';

// Config types matching config.yaml structure
interface RobotConfig {
  com_port: string;
  baud_rate: number;
  timeout: number;
  auto_home_on_startup: boolean;
  estop_enabled: boolean;
}

interface ServerConfig {
  command_port: number;
  ack_port: number;
  loop_interval: number;
}

interface APIConfig {
  host: string;
  port: number;
  cors_origins: string[];
  ws_max_rate_hz: number;
  ws_default_rate_hz: number;
}

interface LoggingConfig {
  level: string;
  buffer_size: number;
  stream_to_websocket: boolean;
  file_output: string | null;
  initial_log_count: number;
}

interface TCPOffset {
  x: number;
  y: number;
  z: number;
}

interface JointColors {
  J1: string;
  J2: string;
  J3: string;
  J4: string;
  J5: string;
  J6: string;
}

interface SavedPosition {
  name: string;
  joints: number[];
}

interface UIConfig {
  theme: string;
  default_speed_percentage: number;
  show_safety_warnings: boolean;
  step_angle: number;
  default_timeline_duration: number;
  default_fps: number;
  tcp_offset: TCPOffset;
  joint_colors: JointColors;
  saved_positions: SavedPosition[];
}

interface WebSocketConfig {
  default_rate_hz: number;
  topics: string[];
  reconnect: {
    max_attempts: number;
    base_delay_ms: number;
  };
}

interface FrontendConfig {
  websocket: WebSocketConfig;
  api_url: string;
}

export interface Config {
  robot: RobotConfig;
  server: ServerConfig;
  api: APIConfig;
  logging: LoggingConfig;
  ui: UIConfig;
  frontend: FrontendConfig;
}

interface ConfigStore {
  config: Config | null;
  isLoading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  saveConfig: (updates: Partial<Config>) => Promise<void>;
  setConfig: (config: Config) => void;
}

// Default config values (fallback if backend not available)
const defaultConfig: Config = {
  robot: {
    com_port: 'COM6',
    baud_rate: 3000000,
    timeout: 0,
    auto_home_on_startup: true,
    estop_enabled: true,
  },
  server: {
    command_port: 5001,
    ack_port: 5002,
    loop_interval: 0.01,
  },
  api: {
    host: '0.0.0.0',
    port: 3001,
    cors_origins: ['http://localhost:3000', 'http://localhost:3001'],
    ws_max_rate_hz: 50,
    ws_default_rate_hz: 10,
  },
  logging: {
    level: 'DEBUG',
    buffer_size: 1000,
    stream_to_websocket: true,
    file_output: null,
    initial_log_count: 100,
  },
  ui: {
    theme: 'light',
    default_speed_percentage: 50,
    show_safety_warnings: true,
    step_angle: 1.0,
    default_timeline_duration: 10,
    default_fps: 60,
    tcp_offset: {
      x: 47,
      y: 0,
      z: -62,
    },
    joint_colors: {
      J1: '#FF6B6B',
      J2: '#4ECDC4',
      J3: '#45B7D1',
      J4: '#FFA07A',
      J5: '#98D8C8',
      J6: '#F7DC6F',
    },
    saved_positions: [
      { name: 'Home', joints: [90, -90, 180, 0, 0, 180] },
      { name: 'Park', joints: [90, -120, 130, 0, 0, 180] },
      { name: 'Ready', joints: [0, -45, 90, 0, 45, 0] },
    ],
  },
  frontend: {
    websocket: {
      default_rate_hz: 10,
      topics: ['status', 'joints', 'pose', 'io', 'gripper'],
      reconnect: {
        max_attempts: 10,
        base_delay_ms: 1000,
      },
    },
    api_url: 'http://localhost:3001',
  },
};

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: defaultConfig,
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/config`);
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }
      const config = await response.json();
      set({ config, isLoading: false });
    } catch (error) {
      console.error('Error fetching config:', error);
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      });
    }
  },

  saveConfig: async (updates: Partial<Config>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error(`Failed to save config: ${response.statusText}`);
      }
      const config = await response.json();
      set({ config, isLoading: false });
    } catch (error) {
      console.error('Error saving config:', error);
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      });
    }
  },

  setConfig: (config: Config) => {
    set({ config });
  },
}));
