import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Loading } from './components/ui';
import { AdminOnly, AppLayout } from './layouts/AppLayout';
import { PublicLayout } from './layouts/PublicLayout';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Pages are split into separate chunks so the public site loads fast on phones.
const Home = lazy(() => import('./pages/public/Home'));
const Events = lazy(() => import('./pages/public/Events'));
const EventYearPage = lazy(() => import('./pages/public/EventYear'));
const Gallery = lazy(() => import('./pages/public/Gallery'));
const AlbumPage = lazy(() => import('./pages/public/Album'));
const Videos = lazy(() => import('./pages/public/Videos'));
const Finance = lazy(() => import('./pages/public/Finance'));
const Sarees = lazy(() => import('./pages/public/Sarees'));
const About = lazy(() => import('./pages/public/About'));

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Members = lazy(() => import('./pages/app/Members'));
const Contributions = lazy(() => import('./pages/app/Contributions'));
const Expenses = lazy(() => import('./pages/app/Expenses'));
const Budget = lazy(() => import('./pages/app/Budget'));
const SareesApp = lazy(() => import('./pages/app/Sarees'));
const Photos = lazy(() => import('./pages/app/Photos'));
const VideosApp = lazy(() => import('./pages/app/Videos'));
const EventsAdmin = lazy(() => import('./pages/app/EventsAdmin'));
const ActivityPage = lazy(() => import('./pages/app/Activity'));
const SettingsPage = lazy(() => import('./pages/app/Settings'));
const Profile = lazy(() => import('./pages/app/Profile'));

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:year" element={<EventYearPage />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="gallery/album/:albumId" element={<AlbumPage />} />
          <Route path="videos" element={<Videos />} />
          <Route path="finance" element={<Finance />} />
          <Route path="sarees" element={<Sarees />} />
          <Route path="about" element={<About />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="members" element={<Members />} />
          <Route path="contributions" element={<Contributions />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="budget" element={<Budget />} />
          <Route path="sarees" element={<SareesApp />} />
          <Route path="photos" element={<Photos />} />
          <Route path="videos" element={<VideosApp />} />
          <Route path="events" element={<AdminOnly><EventsAdmin /></AdminOnly>} />
          <Route path="activity" element={<AdminOnly><ActivityPage /></AdminOnly>} />
          <Route path="settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<NotFound inApp />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
