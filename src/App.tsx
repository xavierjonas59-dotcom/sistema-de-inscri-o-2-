import React from 'react';
import { RouterProvider, createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router';

import Index from '@/pages/Index';
import AdminLogin from '@/pages/admin/Login';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminEventos from '@/pages/admin/Eventos';
import AdminIgrejas from '@/pages/admin/Igrejas';

const rootRoute = createRootRoute({
  component: Outlet,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Index,
});

const adminLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/login',
  component: AdminLogin,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminDashboard,
});

const adminEventosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/eventos',
  component: AdminEventos,
});

const adminIgrejasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/igrejas',
  component: AdminIgrejas,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  adminLoginRoute,
  adminRoute,
  adminEventosRoute,
  adminIgrejasRoute,
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
