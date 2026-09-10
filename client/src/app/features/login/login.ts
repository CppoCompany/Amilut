import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

const DEFAULT_RETURN_URL = '/workspace';

/**
 * Login page: user name (email) + password. The password is optional for now
 * and is only forwarded to the API when provided.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control(''),
  });

  /** Set once a submit has been attempted, so errors show even on untouched fields. */
  protected readonly submitted = signal(false);

  /** True while the credentials are being exchanged with the backend. */
  protected readonly loading = this.auth.loading;

  /** Hebrew error message to show under the form, or `null`. */
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Clear the server error as soon as the user edits anything.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(null));
  }

  protected get email(): AbstractControl {
    return this.form.controls.email;
  }

  /** Whether to surface validation errors for a control yet. */
  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected async onSubmit(): Promise<void> {
    this.error.set(null);

    if (this.form.invalid) {
      this.submitted.set(true);
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.login(email.trim(), password || undefined);
      await this.router.navigateByUrl(this.resolveReturnUrl());
    } catch (err) {
      this.error.set(
        err instanceof HttpErrorResponse && err.status === 403
          ? 'החשבון אינו מורשה'
          : 'ההתחברות נכשלה, נסה שוב',
      );
    }
  }

  /** Only honour `returnUrl` when it is a same-origin relative path. */
  private resolveReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      return returnUrl;
    }
    return DEFAULT_RETURN_URL;
  }
}
