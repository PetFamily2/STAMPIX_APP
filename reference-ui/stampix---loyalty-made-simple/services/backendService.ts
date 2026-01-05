
import { createClient } from '@supabase/supabase-js';
import { LoyaltyCard, UserRole } from '../types';

/**
 * ⚠️ שים לב: השגיאה "Forbidden use of secret API key" נובעת משימוש במפתח הלא נכון.
 * עליך להעתיק את ה-anon key (המפתח הציבורי) מהפאנל של Supabase.
 * נתיב: Project Settings -> API -> Project API keys -> anon (public)
 * אל תשתמש במפתח שמתחיל ב-sb_secret_ או ב-service_role.
 */
const SUPABASE_URL = 'https://mtobkdttmjzocvdvjwko.supabase.co';
const SUPABASE_ANON_KEY: string = 'sb_publishable_4_Pthp9SNUpmY6kcW9_9dQ_klFxhsQR'; 

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const backendService = {
  // Authentication
  async register(email: string, pass: string, role: UserRole) {
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password: pass 
    });

    if (error) throw error;
    if (data.user) {
      // יצירת פרופיל משתמש בטבלה נפרדת
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{ 
          id: data.user.id, 
          role, 
          full_name: email.split('@')[0] 
        }]);
      
      if (profileError) throw profileError;
    }
    return data.user;
  },

  async login(email: string, pass: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password: pass 
    });

    if (error) throw error;
    if (!data.user) throw new Error("User not found");

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return { user: data.user, profile: profile || { role: 'customer' } };
  },

  async logout() {
    return supabase.auth.signOut();
  },

  // Merchant Operations
  async saveBusinessCard(merchantId: string, cardData: Partial<LoyaltyCard>) {
    const { error } = await supabase
      .from('loyalty_cards')
      .upsert({
        merchant_id: merchantId,
        business_name: cardData.businessName,
        reward_text: cardData.reward,
        max_stamps: cardData.maxStamps,
        color: cardData.color,
      }, { onConflict: 'merchant_id' });

    if (error) throw error;
  },

  // Customer Operations
  async getMyCards(customerId: string) {
    const { data, error } = await supabase
      .from('customer_stamps')
      .select(`
        current_stamps,
        loyalty_cards (
          id,
          business_name,
          reward_text,
          max_stamps,
          color
        )
      `)
      .eq('customer_id', customerId);

    if (error) throw error;
    
    return (data || []).map((item: any) => ({
      id: item.loyalty_cards.id,
      businessName: item.loyalty_cards.business_name,
      currentStamps: item.current_stamps,
      maxStamps: item.loyalty_cards.max_stamps,
      reward: item.loyalty_cards.reward_text,
      color: item.loyalty_cards.color
    })) as LoyaltyCard[];
  },

  async addStamp(customerId: string, cardId: string) {
    // שלב 1: בדוק אם כבר קיים רישום
    const { data } = await supabase
      .from('customer_stamps')
      .select('current_stamps')
      .eq('customer_id', customerId)
      .eq('card_id', cardId)
      .single();

    if (data) {
      // עדכון קיים
      await supabase
        .from('customer_stamps')
        .update({ current_stamps: data.current_stamps + 1 })
        .eq('customer_id', customerId)
        .eq('card_id', cardId);
    } else {
      // יצירה חדשה
      await supabase
        .from('customer_stamps')
        .insert([{ 
          customer_id: customerId, 
          card_id: cardId, 
          current_stamps: 1 
        }]);
    }
  }
};
