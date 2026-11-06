import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest { return { name: 'Echoes of Home', short_name: 'Echoes', description: 'Private-by-default family oral histories.', start_url: '/', display: 'standalone', background_color: '#fffdf8', theme_color: '#1f6f67', icons: [] }; }
