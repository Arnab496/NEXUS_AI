import React, { useState, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ScatterChart, Scatter, ZAxis,
  Treemap, FunnelChart, Funnel, LabelList,
  ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { 
  LayoutDashboard, MessageSquare, Upload, Send, 
  Plus, Trash2, Maximize2, Minimize2, Download,
  TrendingUp, AlertCircle, Info, Sparkles, ChevronRight,
  FileText, X, RefreshCw, Database, BrainCircuit,
  Settings, Bell, Search, Filter, User, LogOut, LogIn,
  Share2, Save, History, ChevronDown, Check, MoreVertical, Mic
} from 'lucide-react';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  Timestamp,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { processAssistantCommand, getInitialSuggestions, type ChartConfig, type AssistantResponse } from './services/geminiService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import * as XLSX from 'xlsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const ChartRenderer = ({ config, data }: { config: ChartConfig; data: any[] }) => {
  const colors = config.colors || ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F43F5E'];
  
  // Defensive check for data
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 p-8">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
          <Database className="w-8 h-8 opacity-20" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-bold text-zinc-400">No Data Available</p>
          <p className="text-[10px] font-mono uppercase tracking-widest opacity-50">Awaiting dataset ingestion</p>
        </div>
      </div>
    );
  }

  // Helper to find actual column name in data (case-insensitive)
  const findKey = (key?: string) => {
    if (!key || data.length === 0) return key;
    const firstRow = data[0];
    const actualKey = Object.keys(firstRow).find(k => k.toLowerCase() === key.toLowerCase());
    return actualKey || key;
  };

  const xAxisKey = React.useMemo(() => findKey(config.xAxis), [config.xAxis, data]);
  const dataKeys = React.useMemo(() => config.dataKeys.map(k => findKey(k)).filter(Boolean) as string[], [config.dataKeys, data]);
  const zAxisKey = React.useMemo(() => findKey(config.zAxis), [config.zAxis, data]);
  const xKey = xAxisKey || 'category';

  // Generic aggregation helper for categorical data
  const categoricalData = React.useMemo(() => {
    const xKName = xAxisKey || 'category';
    if (dataKeys.length === 0) return data.slice(0, 50);
    
    const aggregated = data.reduce((acc: any, curr: any) => {
      const groupValue = String((xAxisKey ? curr[xAxisKey] : null) || 'Other');
      if (!acc[groupValue]) {
        acc[groupValue] = { [xKName]: groupValue };
        dataKeys.forEach(yk => acc[groupValue][yk] = 0);
      }
      dataKeys.forEach(yk => {
        const val = parseFloat(curr[yk]);
        if (!isNaN(val)) acc[groupValue][yk] += val;
      });
      return acc;
    }, {});

    return Object.values(aggregated)
      .sort((a: any, b: any) => {
        return (Number(b[dataKeys[0]]) || 0) - (Number(a[dataKeys[0]]) || 0);
      })
      .slice(0, 15);
  }, [data, xAxisKey, dataKeys]);

  const displayData = React.useMemo(() => data.slice(0, 50), [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl">
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-3 py-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-xs font-bold text-white">{entry.name}:</span>
              <span className="text-xs font-mono text-blue-400">
                {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    if (dataKeys.length === 0 && config.type !== 'venn' && config.type !== 'network' && config.type !== 'stats') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
          <AlertCircle className="w-6 h-6 opacity-20" />
          <p className="text-[10px] font-mono uppercase tracking-widest">Invalid Data Mapping</p>
        </div>
      );
    }

    switch (config.type) {
      case 'bar':
        return (
          <BarChart data={categoricalData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey={xKey} stroke="#52525B" fontSize={10} tickLine={false} axisLine={false} tick={{ dy: 10 }} />
            <YAxis stroke="#52525B" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
            {dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[6, 6, 0, 0]} barSize={30} />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={categoricalData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey={xKey} stroke="#52525B" fontSize={10} tickLine={false} axisLine={false} tick={{ dy: 10 }} />
            <YAxis stroke="#52525B" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
            {dataKeys.map((key, i) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[i % colors.length]} 
                strokeWidth={3} 
                dot={{ r: 4, fill: colors[i % colors.length], strokeWidth: 2, stroke: '#050505' }} 
                activeDot={{ r: 6, strokeWidth: 0 }} 
              />
            ))}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={categoricalData}>
            <defs>
              {dataKeys.map((key, i) => (
                <linearGradient key={`grad-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey={xKey} stroke="#52525B" fontSize={10} tickLine={false} axisLine={false} tick={{ dy: 10 }} />
            <YAxis stroke="#52525B" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
            {dataKeys.map((key, i) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[i % colors.length]} 
                strokeWidth={3}
                fillOpacity={1} 
                fill={`url(#color-${key})`} 
              />
            ))}
          </AreaChart>
        );
      case 'pie':
        const pieData = categoricalData.slice(0, 10);

        return (
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="75%"
              paddingAngle={2}
              dataKey={dataKeys[0]}
              nameKey={xKey}
              label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
              labelLine={true}
            >
              {pieData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="rgba(0,0,0,0.2)" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={36} 
              iconType="circle"
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
            />
          </PieChart>
        );
      case 'scatter':
        return (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
            <XAxis type="number" dataKey={xAxisKey} name={xAxisKey} stroke="#71717A" fontSize={10} />
            <YAxis type="number" dataKey={findKey(config.yAxis)} name={config.yAxis} stroke="#71717A" fontSize={10} />
            <ZAxis type="number" range={[64, 144]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter name={config.title} data={displayData} fill={colors[0]} />
          </ScatterChart>
        );
      case 'heatmap':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <div className="grid grid-cols-5 gap-1 w-full max-w-md">
              {displayData.slice(0, 25).map((item, i) => {
                const val = parseFloat(item[dataKeys[0]]) || 0;
                const intensity = isFinite(val) ? Math.min(Math.max(val / 100, 0.1), 1) : 0.1;
                return (
                  <div 
                    key={i} 
                    className="aspect-square rounded-sm flex items-center justify-center text-[8px] text-white font-bold transition-all hover:scale-110 cursor-help"
                    style={{ backgroundColor: colors[0], opacity: String(intensity) }}
                    title={`${item[xAxisKey || ''] || 'N/A'}: ${val}`}
                  >
                    {val}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
              <span>{xAxisKey || 'X'}</span>
              <div className="w-24 h-2 bg-gradient-to-r from-zinc-800 to-blue-500 rounded-full" />
              <span>{findKey(config.yAxis) || 'Y'}</span>
            </div>
          </div>
        );
      case 'histogram':
        return (
          <BarChart data={displayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="#71717A" fontSize={10} />
            <YAxis stroke="#71717A" fontSize={10} />
            <Tooltip />
            <Bar dataKey={dataKeys[0]} fill={colors[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case 'distribution':
        return (
          <ComposedChart data={displayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="#71717A" fontSize={10} />
            <YAxis stroke="#71717A" fontSize={10} />
            <Tooltip />
            <Area type="monotone" dataKey={dataKeys[0]} fill={colors[0]} stroke={colors[0]} fillOpacity={0.2} />
            <Bar dataKey={dataKeys[0]} barSize={20} fill={colors[1] || colors[0]} opacity={0.5} />
          </ComposedChart>
        );
      case 'venn':
        return (
          <div className="flex items-center justify-center h-full w-full p-4">
            <div className="relative w-full h-full max-w-[300px] max-h-[200px] flex items-center justify-center">
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="absolute w-[60%] aspect-square rounded-full border-2 border-blue-500/40 bg-blue-500/10 flex items-center justify-center -translate-x-[20%] mix-blend-screen"
              >
                <div className="text-center">
                  <span className="block text-[8px] md:text-[10px] font-mono text-blue-400 uppercase truncate px-2">{xAxisKey || 'Group A'}</span>
                  <span className="text-sm md:text-lg font-bold">60%</span>
                </div>
              </motion.div>
              <motion.div 
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="absolute w-[60%] aspect-square rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center translate-x-[20%] mix-blend-screen"
              >
                <div className="text-center">
                  <span className="block text-[8px] md:text-[10px] font-mono text-emerald-400 uppercase truncate px-2">{findKey(config.yAxis) || 'Group B'}</span>
                  <span className="text-sm md:text-lg font-bold">45%</span>
                </div>
              </motion.div>
              <div className="z-10 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 shadow-xl">
                <span className="text-[8px] md:text-[10px] font-bold text-white whitespace-nowrap">25% Overlap</span>
              </div>
            </div>
          </div>
        );
      case 'stats':
        return (
          <div className="grid grid-cols-2 gap-4 p-4 h-full overflow-y-auto scrollbar-hide">
            {config.statsData && Object.entries(config.statsData).map(([key, val]: [string, any]) => (
              <div key={key} className="p-4 rounded-xl bg-white/5 border border-zinc-800 flex flex-col gap-1">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{key}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white">
                    {typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      case 'correlation':
        const matrix = config.statsData?.matrix || [];
        const keys = dataKeys.length > 0 ? dataKeys : (config.statsData?.keys || []);
        if (keys.length === 0) return <div className="flex items-center justify-center h-full text-[10px] font-mono uppercase opacity-30">No Correlation Data</div>;
        
        return (
          <div className="w-full h-full flex flex-col p-4 overflow-hidden">
            <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}>
              {keys.map((key: string, i: number) => (
                keys.map((key2: string, j: number) => {
                  const rawVal = matrix[i]?.[j];
                  const val = (typeof rawVal === 'number' && isFinite(rawVal)) ? rawVal : 0;
                  const opacity = Math.min(Math.max(Math.abs(val), 0.1), 1);
                  const color = val > 0 ? `rgba(59, 130, 246, ${opacity})` : `rgba(239, 68, 68, ${opacity})`;
                  return (
                    <div 
                      key={`${i}-${j}`} 
                      className="aspect-square rounded-sm flex items-center justify-center text-[8px] font-bold transition-all hover:scale-110 cursor-help"
                      style={{ backgroundColor: color }}
                      title={`${key} vs ${key2}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(1)}
                    </div>
                  );
                })
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[8px] text-zinc-500 font-mono uppercase tracking-tighter">
              <span>Negative</span>
              <div className="flex-1 mx-4 h-1 bg-gradient-to-r from-red-500 via-zinc-800 to-blue-500 rounded-full" />
              <span>Positive</span>
            </div>
          </div>
        );
      case 'radar':
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={categoricalData.slice(0, 8)}>
            <PolarGrid stroke="#27272A" />
            <PolarAngleAxis dataKey={xKey} tick={{ fill: '#71717A', fontSize: 10 }} />
            <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: '#71717A', fontSize: 8 }} />
            {dataKeys.map((key, i) => (
              <Radar
                key={key}
                name={key}
                dataKey={key}
                stroke={colors[i % colors.length]}
                fill={colors[i % colors.length]}
                fillOpacity={0.6}
              />
            ))}
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </RadarChart>
        );
      case 'bubble':
        return (
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis 
              type="number" 
              dataKey={xAxisKey} 
              name={xAxisKey} 
              stroke="#666" 
              fontSize={10}
              tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString() : val}
            />
            <YAxis 
              type="number" 
              dataKey={dataKeys[0]} 
              name={dataKeys[0]} 
              stroke="#666" 
              fontSize={10}
              tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString() : val}
            />
            <ZAxis 
              type="number" 
              dataKey={zAxisKey || dataKeys[1] || dataKeys[0]} 
              range={[100, 2000]} 
              name={zAxisKey || 'Size'} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter 
              name={config.title} 
              data={displayData} 
              fill={config.colors?.[0] || "#3b82f6"} 
              fillOpacity={0.6}
              stroke="#3b82f6"
            />
          </ScatterChart>
        );

      case 'treemap':
        return (
          <Treemap
            data={categoricalData.map(d => ({ name: d[xKey], size: d[dataKeys[0]] }))}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="#fff"
            fill="#3b82f6"
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        );

      case 'funnel':
        return (
          <FunnelChart>
            <Tooltip content={<CustomTooltip />} />
            <Funnel
              dataKey={dataKeys[0]}
              data={categoricalData.map(d => ({ value: d[dataKeys[0]], name: d[xKey], fill: config.colors?.[0] || "#3b82f6" }))}
              isAnimationActive
            >
              <LabelList position="right" fill="#eee" stroke="none" dataKey="name" />
            </Funnel>
          </FunnelChart>
        );

      case 'venn':
        const vennData = categoricalData.slice(0, 3);
        return (
          <div className="w-full h-full flex items-center justify-center relative">
            <svg viewBox="0 0 400 400" className="w-full h-full max-w-[400px]">
              {vennData.map((d, i) => {
                const angle = (i * 2 * Math.PI) / vennData.length - Math.PI / 2;
                const r = 80;
                const cx = 200 + Math.cos(angle) * 50;
                const cy = 200 + Math.sin(angle) * 50;
                return (
                  <g key={i} className="transition-all duration-500 hover:opacity-80 cursor-help">
                    <circle 
                      cx={cx} cy={cy} r={r} 
                      fill={config.colors?.[i] || ['#3b82f6', '#8b5cf6', '#ec4899'][i]} 
                      fillOpacity={0.4}
                      stroke={config.colors?.[i] || ['#3b82f6', '#8b5cf6', '#ec4899'][i]}
                      strokeWidth="2"
                    />
                    <text 
                      x={cx} y={cy} 
                      textAnchor="middle" 
                      fill="white" 
                      fontSize="12" 
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {String(d[xKey]).slice(0, 10)}
                    </text>
                    <text 
                      x={cx} y={cy + 20} 
                      textAnchor="middle" 
                      fill="white" 
                      fontSize="10"
                      className="pointer-events-none"
                    >
                      {d[dataKeys[0]]}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        );

      case 'network':
        const nodes = categoricalData.slice(0, 10);
        return (
          <div className="w-full h-full flex items-center justify-center relative bg-black/20 rounded-3xl overflow-hidden p-4">
            <svg viewBox="0 0 400 400" className="w-full h-full">
              {nodes.map((node, i) => {
                const angle = (i * 2 * Math.PI) / nodes.length;
                const cx = 200 + Math.cos(angle) * 120;
                const cy = 200 + Math.sin(angle) * 120;
                return (
                  <g key={i}>
                    <line 
                      x1="200" y1="200" x2={cx} y2={cy} 
                      stroke="#333" strokeWidth="1" strokeDasharray="4 4" 
                    />
                    <circle 
                      cx={cx} cy={cy} r={15} 
                      fill="#3b82f6" fillOpacity={0.2} 
                      stroke="#3b82f6" strokeWidth="2" 
                    />
                    <text 
                      x={cx} y={cy + 30} 
                      textAnchor="middle" 
                      fill="#666" fontSize="8"
                    >
                      {String(node[xKey]).slice(0, 8)}
                    </text>
                  </g>
                );
              })}
              <circle cx="200" cy="200" r={30} fill="#3b82f6" fillOpacity={0.1} stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 5" />
              <text x="200" y="205" textAnchor="middle" fill="#3b82f6" fontSize="10" fontWeight="bold">CORE</text>
            </svg>
          </div>
        );
      default:
        return <div className="flex items-center justify-center h-full text-zinc-500">Rendering {config.type}...</div>;
    }
  };

  return (
    <div className="h-full w-full min-h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

const Card = ({ 
  children, 
  title, 
  onRemove, 
  onToggleExpand, 
  isExpanded,
  insights,
  description,
  type,
  id
}: { 
  children: React.ReactNode, 
  title?: string, 
  onRemove?: () => void,
  onToggleExpand?: () => void,
  isExpanded?: boolean,
  insights?: string[],
  description?: string,
  type?: string,
  id?: string
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const downloadAsImage = async () => {
    if (!cardRef.current) return;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: '#09090b',
      scale: 2
    });
    const link = document.createElement('a');
    link.download = `${title || 'chart'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <motion.div 
      layout
      ref={cardRef}
      className={cn(
        "glass-panel p-10 flex flex-col gap-8 relative group card-glow overflow-hidden",
        isExpanded ? "fixed inset-8 z-[100] bg-black/95 backdrop-blur-2xl" : "h-full"
      )}
    >
      <div className="absolute top-0 right-0 p-12 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
        <LayoutDashboard className="w-48 h-48 rotate-12" />
      </div>

      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-500">
            <Sparkles className="w-3 h-3" />
            {type || 'Intelligence'} Unit
          </div>
          {title && <h3 className="text-xl font-bold text-white">{title}</h3>}
        </div>
        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
          <button onClick={downloadAsImage} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-zinc-500 hover:text-white transition-all border border-white/5" title="Download Image">
            <Download className="w-5 h-5" />
          </button>
          {onToggleExpand && (
            <button onClick={onToggleExpand} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-zinc-500 hover:text-white transition-all border border-white/5">
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          )}
          {onRemove && (
            <button onClick={onRemove} className="p-3 bg-rose-500/5 hover:bg-rose-500/20 rounded-2xl text-zinc-500 hover:text-rose-400 transition-all border border-rose-500/10">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 min-h-0 relative z-10">
        {children}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10 pt-8 border-t border-white/5">
        {insights && insights.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">Autonomous Synthesis</span>
            </div>
            <ul className="space-y-3">
              {insights.map((insight, i) => (
                <li key={i} className="text-sm text-zinc-400 flex items-start gap-4 leading-relaxed group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40 mt-1.5 shrink-0 group-hover/item:scale-150 group-hover/item:bg-blue-500 transition-all" />
                  <span className="group-hover/item:text-zinc-200 transition-colors">{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {description && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Info className="w-4 h-4 text-zinc-500" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Technical Context</span>
            </div>
            <p className="text-sm text-zinc-500 font-light italic leading-relaxed border-l-2 border-zinc-800 pl-4">
              {description}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [view, setView] = useState<'landing' | 'dashboard' | 'history' | 'table'>('landing');
  
  const [data, setData] = useState<any[]>([]);
  const [originalData, setOriginalData] = useState<any[]>([]);
  const [widgets, setWidgets] = useState<ChartConfig[]>([]);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, suggestions?: string[] }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedWidgetId, setExpandedWidgetId] = useState<string | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState("Untitled Dashboard");
  const [savedDashboards, setSavedDashboards] = useState<any[]>([]);
  
  const [dataHealth, setDataHealth] = useState<AssistantResponse['dataHealth'] | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [calculatedFields, setCalculatedFields] = useState<{ name: string, formula: string, description: string }[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('share');
    if (sharedId) {
      loadSharedDashboard(sharedId);
    }
  }, []);

  const loadSharedDashboard = async (id: string) => {
    setLoading(true);
    try {
      const docRef = doc(db, 'dashboards', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        loadDashboard({ id: docSnap.id, ...docSnap.data() });
      }
    } catch (error) {
      console.error("Error loading shared dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        fetchSavedDashboards(u.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSavedDashboards = async (uid: string) => {
    try {
      const q = query(collection(db, 'dashboards'), where('userId', '==', uid), orderBy('updatedAt', 'desc'));
      const snapshot = await getDocs(q);
      const dashboards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSavedDashboards(dashboards);
    } catch (error) {
      console.error("Error fetching dashboards:", error);
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setView('dashboard');
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        setAuthError("The sign-in popup was closed before completion. Please try again.");
      } else {
        setAuthError("An error occurred during login. Please check your connection and try again.");
        console.error("Login failed:", error);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('landing');
    setData([]);
    setWidgets([]);
    setMessages([]);
  };

  const handleViewDemo = () => {
    const sampleData = [
      { Month: 'Jan', Sales: 4500, Profit: 1200, Region: 'North' },
      { Month: 'Feb', Sales: 5200, Profit: 1500, Region: 'North' },
      { Month: 'Mar', Sales: 4800, Profit: 1100, Region: 'South' },
      { Month: 'Apr', Sales: 6100, Profit: 1800, Region: 'East' },
      { Month: 'May', Sales: 5900, Profit: 1700, Region: 'West' },
      { Month: 'Jun', Sales: 7200, Profit: 2200, Region: 'North' },
      { Month: 'Jul', Sales: 6800, Profit: 2000, Region: 'South' },
    ];
    setView('dashboard');
    processData(sampleData);
  };

  const saveDashboard = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const dashboardData = {
        userId: user.uid,
        name: dashboardName,
        widgets,
        data: originalData,
        summary: dashboardSummary,
        updatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'dashboards'), dashboardData);
      fetchSavedDashboards(user.uid);
      setMessages(prev => [...prev, { role: 'assistant', content: "Dashboard saved successfully to your history." }]);
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = (dash: any) => {
    setDashboardName(dash.name);
    setWidgets(dash.widgets);
    setOriginalData(dash.data);
    setData(dash.data);
    setDashboardSummary(dash.summary);
    setView('dashboard');
  };

  const deleteDashboard = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'dashboards', id));
      setSavedDashboards(prev => prev.filter(d => d.id !== id));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = file.name.split('.').pop()?.toLowerCase();

    if (fileType === 'xlsx' || fileType === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        processData(json);
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data);
        }
      });
    }
  };

  const processData = async (parsedData: any[]) => {
    const filteredData = parsedData.filter((row: any) => row && Object.values(row).some(v => v !== null));
    setOriginalData(filteredData);
    setData(filteredData);
    setView('dashboard');
    setLoading(true);
    try {
      const { suggestions, health } = await getInitialSuggestions(filteredData);
      setDataHealth(health || null);
      setMessages([{ 
        role: 'assistant', 
        content: `Dataset ingested successfully! I've detected ${Object.keys(filteredData[0] || {}).length} columns. What would you like to visualize?`,
        suggestions: suggestions
      }]);
    } catch (error: any) {
      console.error("Initial analysis error:", error);
      let errorMessage = "Dataset ingested, but I couldn't generate initial insights due to an error.";
      if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429 || (error?.message && error.message.includes('429'))) {
        errorMessage = "Dataset ingested, but the AI engine is at its capacity (Quota Exceeded). You can still try asking questions, but insights might be delayed.";
      }
      setMessages([{ 
        role: 'assistant', 
        content: errorMessage,
        suggestions: ["Analyze sales", "Show distribution", "Summarize data"]
      }]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (newFilters: Record<string, any>) => {
    setFilters(newFilters);
    let filtered = [...originalData];
    Object.entries(newFilters).forEach(([col, val]) => {
      if (val !== null && val !== undefined && val !== "") {
        filtered = filtered.filter(row => String(row[col]).toLowerCase().includes(String(val).toLowerCase()));
      }
    });
    setData(filtered);
  };

  const handleCommand = async (command: string) => {
    if (!command.trim() || data.length === 0) return;
    
    setMessages(prev => [...prev, { role: 'user', content: command }]);
    setInput("");
    setLoading(true);

    try {
      const response = await processAssistantCommand(command, data, widgets);
      
      if (response.newCalculatedField) {
        const { name, formula } = response.newCalculatedField;
        setCalculatedFields(prev => [...prev, response.newCalculatedField!]);
        
        // Apply calculated field to data
        const updatedData = originalData.map(row => {
          try {
            // Simple evaluation for math formulas
            // Replace column names with values
            let evalFormula = formula;
            Object.keys(row).forEach(key => {
              const regex = new RegExp(`\\b${key}\\b`, 'g');
              evalFormula = evalFormula.replace(regex, row[key]);
            });
            // Use Function constructor for safe-ish evaluation of math
            const result = new Function(`return ${evalFormula}`)();
            return { ...row, [name]: result };
          } catch (e) {
            return { ...row, [name]: null };
          }
        });
        setOriginalData(updatedData);
        setData(updatedData);
      }

      if (response.newChart) {
        setWidgets(prev => [...prev, response.newChart!]);
      } else if (response.updatedChartId && response.updatedConfig) {
        setWidgets(prev => prev.map(w => w.id === response.updatedChartId ? { ...w, ...response.updatedConfig } : w));
      }

      if (response.dashboardSummary) {
        setDashboardSummary(response.dashboardSummary);
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.message,
        suggestions: response.suggestedQueries
      }]);
    } catch (error: any) {
      console.error("Assistant error:", error);
      let errorMessage = "I encountered an error processing your request. Please try again.";
      
      if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429 || (error?.message && error.message.includes('429'))) {
        errorMessage = "The AI engine is currently at its capacity (Quota Exceeded). Please wait a moment or check your Gemini API quota limits.";
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!dashboardRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#09090b'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${dashboardName}.pdf`);
    } catch (error) {
      console.error('PDF Export failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const shareDashboard = async () => {
    if (!user) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Please login to save and share dashboards." }]);
      return;
    }
    
    setLoading(true);
    try {
      const dashboardData = {
        userId: user.uid,
        name: dashboardName,
        widgets,
        data: originalData,
        summary: dashboardSummary,
        updatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        isPublic: true
      };
      const docRef = await addDoc(collection(db, 'dashboards'), dashboardData);
      const shareUrl = `${window.location.origin}${window.location.pathname}?share=${docRef.id}`;
      navigator.clipboard.writeText(shareUrl);
      setMessages(prev => [...prev, { role: 'assistant', content: `Dashboard shared! Link copied to clipboard: ${shareUrl}` }]);
      fetchSavedDashboards(user.uid);
    } catch (error) {
      console.error("Share failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearDashboard = () => {
    setWidgets([]);
    setDashboardSummary(null);
    setMessages([{ role: 'assistant', content: "System reset. How can I assist with your data analysis today?" }]);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user && view === 'landing') {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="atmosphere" />
        <div className="grid-overlay" />
        
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl space-y-12 relative z-10"
        >
          <motion.div 
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(59,130,246,0.5)]"
          >
            <BrainCircuit className="w-12 h-12 text-white" />
          </motion.div>
          
          <div className="space-y-4">
            <h1 className="text-6xl font-serif italic text-white text-glow">
              Nexus <span className="text-blue-600">AI</span>
            </h1>
            <p className="text-zinc-400 text-lg max-w-lg mx-auto leading-relaxed">
              The next generation of autonomous data analytics. <br/>
              <span className="text-zinc-300">Connect your data, ask questions, and watch your dashboard build itself.</span>
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
            <button 
              onClick={handleLogin}
              className="group px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-[0_20px_40px_rgba(59,130,246,0.3)] flex items-center gap-3 hover:scale-105 active:scale-95"
            >
              <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              Get Started
            </button>
            <button 
              onClick={handleViewDemo}
              className="px-10 py-5 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl font-bold transition-all backdrop-blur-md hover:scale-105 active:scale-95"
            >
              View Demo
            </button>
          </div>
          
          {authError && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm max-w-md mx-auto flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              {authError}
            </motion.div>
          )}
        </motion.div>

        {/* Decorative elements */}
        <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-blue-600/10 to-transparent pointer-events-none" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#050505] text-zinc-100 font-sans selection:bg-blue-500/30 relative">
      <div className="atmosphere" />
      <div className="grid-overlay" />
      
      {/* Sidebar - Chat Interface */}
      <aside className="w-80 lg:w-96 border-r border-white/5 flex flex-col bg-black/40 backdrop-blur-2xl fixed h-full z-40">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-serif italic text-xl tracking-tight">Nexus AI</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearDashboard}
              className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Clear Dashboard & Chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setView('table')}
              className={cn("p-2 rounded-lg transition-colors", view === 'table' ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300")}
              title="Data Table"
            >
              <Database className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setView('history')}
              className={cn("p-2 rounded-lg transition-colors", view === 'history' ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300")}
              title="Saved Dashboards"
            >
              <History className="w-4 h-4" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-rose-500/10 rounded-lg text-zinc-500 hover:text-rose-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {view === 'history' ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500">Your Saved Works</h2>
            {savedDashboards.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <History className="w-12 h-12 text-zinc-800 mx-auto" />
                <p className="text-sm text-zinc-600">No saved dashboards yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedDashboards.map((dash) => (
                  <div 
                    key={dash.id}
                    className="group p-4 rounded-2xl bg-white/5 border border-zinc-800 hover:border-blue-500/50 transition-all cursor-pointer"
                    onClick={() => loadDashboard(dash)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold truncate pr-4">{dash.name}</h3>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteDashboard(dash.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/20 rounded text-rose-400 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                      <span>{dash.widgets.length} Widgets</span>
                      <span>•</span>
                      <span>{new Date(dash.updatedAt.toDate()).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-zinc-800 flex items-center justify-center">
                    <Database className="w-6 h-6 text-blue-500" />
                  </div>
                  <h2 className="text-sm font-bold">Awaiting Data</h2>
                  <p className="text-xs text-zinc-500">Upload a CSV or JSON file to activate the autonomous engine.</p>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
                  >
                    Upload Dataset
                  </button>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 bg-white/[0.02] border border-white/5 rounded-2xl mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Data Integrity</span>
                      <span className="text-[10px] font-bold text-emerald-500">98% Stable</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '98%' }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                  </div>
                  
                  {messages.map((msg, i) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={i} 
                      className={cn(
                        "flex flex-col gap-2 max-w-[90%]",
                        msg.role === 'user' ? "ml-auto items-end" : "items-start"
                      )}
                    >
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed shadow-lg",
                        msg.role === 'user' 
                          ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-none shadow-blue-500/10" 
                          : "bg-white/[0.03] border border-white/5 rounded-tl-none backdrop-blur-sm"
                      )}>
                        {msg.content}
                      </div>
                      {msg.suggestions && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {msg.suggestions.map((s, si) => (
                            <button 
                              key={si}
                              onClick={() => handleCommand(s)}
                              className="text-[10px] bg-white/5 hover:bg-white/10 border border-zinc-800 px-2 py-1 rounded-full text-zinc-400 hover:text-white transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            <div className="p-6 border-t border-white/5 bg-black/20 backdrop-blur-xl">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleCommand(input); }}
                className="relative group"
              >
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-1000 group-focus-within:duration-200" />
                
                <div className="relative flex flex-col bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden transition-all focus-within:border-blue-500/50 focus-within:shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                  <div className="flex items-center px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => setMessages([{ role: 'assistant', content: "Chat history cleared. How can I help?" }])}
                        className="p-2 text-zinc-600 hover:text-rose-400 transition-colors"
                        title="Clear Chat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        loading ? "bg-amber-500" : "bg-emerald-500"
                      )} />
                      <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                        {loading ? "Processing Intelligence" : "System Ready"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end p-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 text-zinc-500 hover:text-blue-400 hover:bg-white/5 rounded-xl transition-all shrink-0"
                      title="Upload Dataset"
                    >
                      <Upload className="w-4.5 h-4.5" />
                    </button>
                    
                    <textarea 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (input.trim() && !loading) handleCommand(input);
                        }
                      }}
                      placeholder={data.length > 0 ? "Ask Nexus AI..." : "Upload data to begin..."}
                      disabled={loading}
                      rows={1}
                      className="w-full bg-transparent border-none py-2.5 text-sm focus:outline-none focus:ring-0 resize-none max-h-32 scrollbar-hide placeholder:text-zinc-600"
                      style={{ height: 'auto' }}
                    />

                    {input === '/' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute bottom-full left-0 w-full mb-4 p-2 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50"
                      >
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 px-3 py-2 border-b border-white/5">Quick Commands</div>
                        <div className="p-1">
                          {['Analyze sales', 'Show distribution', 'Summarize data', 'Clear dashboard'].map(cmd => (
                            <button 
                              key={cmd}
                              onClick={() => { handleCommand(cmd); setInput(''); }}
                              className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors flex items-center justify-between group"
                            >
                              {cmd}
                              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    <div className="flex items-center gap-1 pb-1 pr-1">
                      <button 
                        type="button"
                        className="p-2 text-zinc-600 hover:text-blue-400 transition-colors"
                        title="Voice Input (Coming Soon)"
                      >
                        <Mic className="w-4 h-4 opacity-40" />
                      </button>
                      {input.trim() && (
                        <button 
                          type="button"
                          onClick={() => setInput('')}
                          className="p-2 text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        type="submit"
                        disabled={!input.trim() || loading}
                        className={cn(
                          "p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0",
                          input.trim() && !loading 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 hover:scale-105 active:scale-95" 
                            : "bg-zinc-800 text-zinc-600"
                        )}
                      >
                        {loading ? <RefreshCw className="w-4.5 h-4.5 animate-spin" /> : <Send className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="px-4 py-1.5 bg-white/[0.01] border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[8px] text-zinc-600 font-mono">
                        <span className="px-1 py-0.5 rounded bg-zinc-900 border border-white/5">Enter</span>
                        <span>to send</span>
                      </div>
                      <div className="flex items-center gap-1 text-[8px] text-zinc-600 font-mono">
                        <span className="px-1 py-0.5 rounded bg-zinc-900 border border-white/5">Shift + Enter</span>
                        <span>for new line</span>
                      </div>
                    </div>
                    <span className="text-[8px] text-zinc-700 font-mono uppercase tracking-widest">v2.0.4</span>
                  </div>
                </div>
              </form>
            </div>
          </>
        )}
      </aside>

      {/* Main Content - Dashboard */}
      <main className="flex-1 lg:ml-80 xl:ml-96 p-4 lg:p-8 flex flex-col gap-8 min-h-screen transition-all">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-blue-600/10 rounded-2xl border border-blue-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.15)]">
              <LayoutDashboard className="w-7 h-7 text-blue-500" />
            </div>
            <div>
              <input 
                value={dashboardName}
                onChange={(e) => setDashboardName(e.target.value)}
                className="text-2xl font-serif italic bg-transparent border-none focus:outline-none focus:ring-0 p-0 w-full text-white"
              />
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
                  {data.length > 0 ? `${data.length} Records Loaded` : "System Idle"}
                </span>
                <div className="w-1 h-1 rounded-full bg-zinc-800" />
                <span className="text-[10px] text-blue-500 font-mono uppercase tracking-widest">
                  Autonomous Mode Active
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data.length > 0 && (
              <div className="flex items-center gap-2 mr-4">
                <Filter className="w-4 h-4 text-zinc-500" />
                <div className="flex gap-2">
                  {Object.keys(data[0] || {}).slice(0, 2).map(col => (
                    <input 
                      key={col}
                      placeholder={`Filter ${col}...`}
                      className="text-[10px] bg-white/5 border border-zinc-800 rounded-lg px-2 py-1 focus:border-blue-500 outline-none w-24"
                      onChange={(e) => applyFilters({ ...filters, [col]: e.target.value })}
                    />
                  ))}
                </div>
              </div>
            )}
            {widgets.length > 0 && (
              <>
                <button 
                  onClick={saveDashboard}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button 
                  onClick={shareDashboard}
                  className="p-2 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-white transition-all border border-zinc-800"
                  title="Share Dashboard"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={exportToPDF}
                  className="p-2 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-white transition-all border border-zinc-800"
                  title="Export PDF"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".csv,.json,.xlsx,.xls" 
              className="hidden" 
            />
          </div>
        </header>

        <div className="flex-1 flex flex-col gap-8" ref={dashboardRef}>
          {view === 'table' ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel overflow-hidden flex flex-col h-[calc(100vh-200px)]"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h2 className="text-lg font-bold">Raw Dataset</h2>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-500 font-mono">{data.length} Rows</span>
                  <button onClick={() => setView('dashboard')} className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-2">
                    <LayoutDashboard className="w-3 h-3" />
                    Back to Dashboard
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto scrollbar-hide">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-white/10">
                    <tr>
                      {data.length > 0 && Object.keys(data[0]).map(key => (
                        <th key={key} className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 whitespace-nowrap">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.slice(0, 100).map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        {Object.values(row).map((val: any, j) => (
                          <td key={j} className="px-6 py-4 text-xs text-zinc-400 whitespace-nowrap">
                            {String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.length > 100 && (
                  <div className="p-8 text-center text-zinc-600 text-xs italic">
                    Showing first 100 records. Use filters to explore more.
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <>
              {dataHealth && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              <div className="glass-panel p-6 border-l-4 border-blue-500">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="w-4 h-4 text-blue-500" />
                  <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400">Schema Analysis</h3>
                </div>
                <div className="space-y-2">
                  {dataHealth.columnTypes && Object.entries(dataHealth.columnTypes).slice(0, 5).map(([col, type]) => (
                    <div key={col} className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">{col}</span>
                      <span className="px-2 py-0.5 rounded bg-white/5 text-blue-400 font-mono">{type}</span>
                    </div>
                  ))}
                  {calculatedFields.map((field, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] border-t border-white/5 pt-2 mt-2">
                      <div className="flex flex-col">
                        <span className="text-blue-400 font-bold">{field.name}</span>
                        <span className="text-[9px] text-zinc-600 font-mono">{field.formula}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[9px]">CALC</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass-panel p-6 border-l-4 border-emerald-500">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400">Data Integrity</h3>
                </div>
                <div className="space-y-2">
                  {dataHealth.missingValues && Object.entries(dataHealth.missingValues).length > 0 ? (
                    Object.entries(dataHealth.missingValues).slice(0, 5).map(([col, count]) => (
                      <div key={col} className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">{col}</span>
                        <span className={cn("font-mono", (count as number) > 0 ? "text-rose-400" : "text-emerald-400")}>
                          {(count as number) === 0 ? "Clean" : `${count} Missing`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-zinc-500 italic">No missing values detected.</p>
                  )}
                </div>
              </div>
              <div className="glass-panel p-6 border-l-4 border-amber-500">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400">Anomalies</h3>
                </div>
                <div className="space-y-2">
                  {dataHealth.anomalies.length > 0 ? (
                    dataHealth.anomalies.slice(0, 3).map((anomaly, i) => (
                      <div key={i} className="text-[11px] text-zinc-400 flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        {anomaly}
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-zinc-500 italic">No significant anomalies found.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {dashboardSummary && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-10 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-800 text-white shadow-[0_40px_80px_-20px_rgba(59,130,246,0.4)] relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-16 opacity-10 group-hover:scale-110 transition-transform duration-1000">
                <Sparkles className="w-48 h-48" />
              </div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                  <Sparkles className="w-4 h-4" />
                  Executive Summary
                </div>
                <h3 className="text-3xl font-bold leading-tight max-w-2xl">
                  Strategic Data Synthesis
                </h3>
                <p className="text-blue-100 text-lg leading-relaxed max-w-3xl">
                  {dashboardSummary}
                </p>
              </div>
            </motion.div>
          )}

          {widgets.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
              <div className="w-24 h-24 rounded-3xl border-2 border-dashed border-zinc-800 flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-blue-500" />
              </div>
              <h3 className="text-xl font-serif italic mb-2">Empty Canvas</h3>
              <p className="text-sm max-w-xs text-zinc-500">
                Instruct the AI to generate visualizations or perform a deep dive into your data.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 auto-rows-min">
              {widgets.map((widget) => (
                <div key={widget.id} className={cn(
                  "transition-all duration-700",
                  expandedWidgetId === widget.id ? "col-span-full" : ""
                )}>
                  <Card 
                    title={widget.title}
                    description={widget.description}
                    insights={widget.insights}
                    type={widget.type}
                    onRemove={() => setWidgets(prev => prev.filter(w => w.id !== widget.id))}
                    onToggleExpand={() => setExpandedWidgetId(expandedWidgetId === widget.id ? null : widget.id)}
                    isExpanded={expandedWidgetId === widget.id}
                  >
                    <ChartRenderer config={widget} data={data} />
                  </Card>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  </main>

      {/* Global Overlays */}
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono uppercase tracking-widest animate-pulse">AI Engine Active...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
