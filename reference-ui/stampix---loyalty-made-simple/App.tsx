
import React, { useState, useEffect } from 'react';
import { UserRole, LoyaltyCard, Activity, MerchantTier } from './types';
import Splash from './pages/Splash';
import RoleSelection from './pages/RoleSelection';
import Login from './pages/Login'; // Now serves as unified Auth
import ProfileSetup from './pages/ProfileSetup';
import CustomerDashboard from './pages/CustomerDashboard';
import MerchantDashboard from './pages/MerchantDashboard';
import MerchantAnalytics from './pages/MerchantAnalytics';
import MerchantStoreSettings from './pages/MerchantStoreSettings';
import Scanner from './pages/Scanner';
import CustomerScanner from './pages/CustomerScanner';
import MerchantQR from './pages/MerchantQR';
import VideoGenerator from './pages/VideoGenerator';
import CardDetails from './pages/CardDetails';
import Rewards from './pages/Rewards';
import Discovery from './pages/Discovery';
import Checkout from './pages/Checkout';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import EmployeeManagement from './pages/EmployeeManagement';
import MerchantProfileSettings from './pages/MerchantProfileSettings';
import PlanSelection from './pages/PlanSelection';

type Page = 'splash' | 'role' | 'login' | 'profile' | 'plan_selection' | 'customer_home' | 'merchant_home' | 'merchant_analytics' | 'merchant_store_settings' | 'scanner' | 'customer_scanner' | 'merchant_qr' | 'settings' | 'video_generator' | 'card_details' | 'rewards' | 'discovery' | 'checkout' | 'super_admin_home' | 'employee_mgmt' | 'merchant_profile';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('splash');
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null);
  const [merchantTier, setMerchantTier] = useState<MerchantTier>(null);

  useEffect(() => {
    if (currentPage === 'splash') {
      const timer = setTimeout(() => {
        setCurrentPage('role');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentPage]);

  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role);
    setCurrentPage('login');
  };

  const handleLoginSuccess = (isAdmin: boolean = false, isNewUser: boolean = false) => {
    setIsLoggedIn(true);
    if (isAdmin) {
      setUserRole('merchant');
      setMerchantTier('unlimited');
      setCurrentPage('super_admin_home');
    } else if (isNewUser) {
      setCurrentPage('profile');
    } else {
      // Direct access for existing users
      if (userRole === 'merchant') {
        setMerchantTier('starter'); // Mock default for demo
        setCurrentPage('merchant_home');
      } else {
        setCurrentPage('customer_home');
      }
    }
  };

  const handleProfileComplete = () => {
    if (userRole === 'merchant') {
      setCurrentPage('plan_selection');
    } else {
      setCurrentPage('customer_home');
    }
  };

  const handlePlanSelect = (tier: MerchantTier) => {
    setMerchantTier(tier);
    if (tier === 'starter') {
      setCurrentPage('merchant_home');
    } else {
      setCurrentPage('checkout');
    }
  };

  const handleUpgradeSuccess = () => {
    setCurrentPage('merchant_home');
  };

  const handleCardClick = (card: LoyaltyCard) => {
    setSelectedCard(card);
    setCurrentPage('card_details');
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-mint-bg shadow-2xl overflow-x-hidden flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-5%] right-[-5%] w-[50%] h-[50%] bg-primary/5 blur-[100px] rounded-full"></div>
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {currentPage === 'splash' && <Splash />}
        {currentPage === 'role' && <RoleSelection onSelect={handleRoleSelect} />}
        {currentPage === 'login' && (
          <Login 
            role={userRole}
            onBack={() => setCurrentPage('role')} 
            onSuccess={handleLoginSuccess} 
          />
        )}
        {currentPage === 'profile' && <ProfileSetup onComplete={handleProfileComplete} />}
        {currentPage === 'plan_selection' && <PlanSelection onSelect={handlePlanSelect} />}
        
        {currentPage === 'customer_home' && <CustomerDashboard onNavigate={setCurrentPage} onCardClick={handleCardClick} activeTab="wallet" />}
        {currentPage === 'rewards' && <Rewards onNavigate={setCurrentPage} />}
        {currentPage === 'discovery' && <Discovery onNavigate={setCurrentPage} />}
        
        {currentPage === 'merchant_home' && <MerchantDashboard onNavigate={setCurrentPage} />}
        {currentPage === 'merchant_analytics' && <MerchantAnalytics onBack={() => setCurrentPage('merchant_home')} />}
        {currentPage === 'merchant_store_settings' && (
          <MerchantStoreSettings 
            onBack={() => setCurrentPage('merchant_home')} 
            onNavigate={setCurrentPage}
            tier={merchantTier || 'starter'}
          />
        )}
        
        {currentPage === 'super_admin_home' && <SuperAdminDashboard onNavigate={setCurrentPage} />}
        {currentPage === 'employee_mgmt' && <EmployeeManagement onBack={() => setCurrentPage('merchant_home')} />}
        {currentPage === 'merchant_profile' && <MerchantProfileSettings onBack={() => setCurrentPage('merchant_home')} onNavigate={setCurrentPage} tier={merchantTier || 'starter'} />}
        
        {currentPage === 'checkout' && (
          <Checkout 
            onBack={() => setCurrentPage('plan_selection')} 
            onSuccess={handleUpgradeSuccess} 
          />
        )}
        
        {currentPage === 'card_details' && selectedCard && (
          <CardDetails card={selectedCard} onBack={() => setCurrentPage('customer_home')} />
        )}
        
        {currentPage === 'scanner' && <Scanner onBack={() => setCurrentPage('merchant_home')} />}
        {currentPage === 'customer_scanner' && <CustomerScanner onBack={() => setCurrentPage('customer_home')} />}
        {currentPage === 'merchant_qr' && <MerchantQR onBack={() => setCurrentPage('merchant_home')} />}
        {currentPage === 'video_generator' && <VideoGenerator onBack={() => setCurrentPage('merchant_home')} />}
        
        {currentPage === 'settings' && (
           <MerchantProfileSettings onBack={() => setCurrentPage('merchant_home')} onNavigate={setCurrentPage} tier={merchantTier || 'starter'} />
        )}
      </div>
    </div>
  );
}
