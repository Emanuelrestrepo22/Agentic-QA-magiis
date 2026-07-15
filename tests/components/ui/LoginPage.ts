/**
 * KATA Architecture - Layer 3: Login Page Component
 *
 * UI component for authentication via the login page.
 * Handles login flows for E2E tests.
 *
 * TODO: Replace 'PROJ' in @atc IDs with your Jira project key (e.g., @atc('UPEX-101'))
 *
 * Page: MAGIIS Carrier V2 — /carrier/#/auth/login (Angular 18, hash routing)
 * Locators (NO hay data-testid en el front; validados en vivo contra UAT):
 * - Email:  input[type="email"]  (placeholder "Ingrese Email")
 * - Password: input[type="password"]  (placeholder "Ingrese Contraseña")
 * - Submit: button[type="submit"]  (texto "Iniciar Sesión")
 * - Error:  .error-sign-in
 * Éxito: redirige a /carrier/#/dashboard.
 * TODO: pedir data-testid al equipo para estabilizar selectores.
 */

import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc, step } from '@utils/decorators';

// ============================================
// Types - Login data structures
// ============================================

/**
 * Login credentials for UI authentication
 * Note: UPEX Dojo uses 'email' field instead of 'username'
 */
export interface LoginCredentials {
  email: string
  password: string
}

// ============================================
// Login Page Component
// ============================================

export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers (Private)
  // ============================================

  /**
   * Fill login form and submit
   * Helper that combines fill + submit actions
   */
  private async fillAndSubmitLoginForm(credentials: LoginCredentials): Promise<void> {
    await this.page.locator('input[type="email"]').fill(credentials.email);
    await this.page.locator('input[type="password"]').fill(credentials.password);
    await this.page.locator('button[type="submit"]').click();
  }

  // ============================================
  // Navigation (Public)
  // ============================================

  /**
   * Navigate to the login page
   * Call this BEFORE using login ATCs
   */
  @step
  async goto(): Promise<void> {
    await this.page.goto(this.buildUrl('/carrier/#/auth/login'));
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  /**
   * ATC: Login with valid credentials - expects success
   *
   * IMPORTANT: Call goto() before this ATC.
   * Fills credentials, submits, and verifies redirect away from login page.
   *
   * @param credentials - Email and password
   */
  @atc('MX-101')
  async loginSuccessfully(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    // Éxito: el SPA carrier-v2 redirige a /carrier/#/dashboard (hash routing)
    await this.page.waitForURL(/\/carrier\/#\/dashboard/, { timeout: 15000 });
    await expect(this.page).not.toHaveURL(/auth\/login/);
  }

  /**
   * ATC: Login with invalid credentials - expects error
   *
   * IMPORTANT: Call goto() before this ATC.
   * Fills invalid credentials, submits, and verifies error message.
   *
   * @param credentials - Invalid email or password
   */
  @atc('MX-102')
  async loginWithInvalidCredentials(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    // Error visible + seguimos en el login (carrier-v2: span.error-sign-in)
    const errorIndicator = this.page.locator('.error-sign-in');
    await expect(errorIndicator).toBeVisible({ timeout: 5000 });
    await expect(this.page).toHaveURL(/auth\/login/);
  }
}
